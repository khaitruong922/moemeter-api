import postgres from 'postgres';
import { Read } from './models';

export const bulkInsertReads = async (sql: postgres.Sql<{}>, reads: Read[]): Promise<void> => {
	if (reads.length === 0) return;
	await sql`
    INSERT INTO reads ${sql(reads)}
  `;
};

export const selectCommonReadsOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<Read[]> => {
	const rows = await sql<Read[]>`
    SELECT DISTINCT r.user_id, r.merged_book_id AS book_id
    FROM reads r
    JOIN (SELECT merged_book_id FROM reads WHERE user_id = ${userId}) AS user_reads ON r.merged_book_id = user_reads.merged_book_id
    WHERE user_id != ${userId}
  `;
	return rows;
};

export const selectFutaribocchiReadsOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<Read[]> => {
	const rows = await sql<Read[]>`
    SELECT DISTINCT r.user_id, r.merged_book_id AS book_id
    FROM reads r
    JOIN (
      SELECT merged_book_id
      FROM reads
      WHERE user_id = ${userId}
      AND merged_book_id IN (
        SELECT merged_book_id FROM reads GROUP BY merged_book_id HAVING COUNT(DISTINCT user_id) = 2
      )
    ) AS user_reads ON r.merged_book_id = user_reads.merged_book_id
    WHERE r.user_id != ${userId}
  `;
	return rows;
};

export const deleteReadsOfUser = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	await sql`
    DELETE FROM reads WHERE user_id = ${userId}
  `;
};

export const deleteReadsOfBook = async (sql: postgres.Sql<{}>, bookId: number): Promise<void> => {
	await sql`
    DELETE FROM reads WHERE book_id = ${bookId}
  `;
};

export const selectReadsByBookId = async (
	sql: postgres.Sql<{}>,
	bookId: number
): Promise<Read[]> => {
	const rows = await sql<Read[]>`
    SELECT *
    FROM reads
    WHERE merged_book_id = ${bookId}
    ORDER BY date ASC, user_id ASC
  `;
	return rows;
};

// How each other reader's ratings compare with this user's, over the books both rated. Each rates
// a book once, with their highest rating across rereads and variants, as in book_ratings. diff is
// the other reader's rating minus this user's: positive means they rated it higher.
export type RatingAgreement = {
	user_id: number;
	rated_count: number;
	same: number;
	higher: number;
	lower: number;
	// [this user's rating, the other reader's] per book, keyed by merged book id, for showing the
	// books behind one part of the bar with both ratings
	book_ratings: Record<string, [number, number]>;
	avg_diff: number;
	avg_abs_diff: number;
	// 相性 (docs/affinity): the points total, for sorting, and as a percentage, for display
	affinity: number;
	affinity_percent: number;
};

export const selectRatingAgreementsOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<{ agreements: RatingAgreement[]; scale: number }> => {
	const rows = await sql<Omit<RatingAgreement, 'affinity_percent'>[]>`
    WITH user_ratings AS (
      SELECT user_id, merged_book_id, max(rating) AS rating
      FROM reads
      WHERE rating IS NOT NULL
      GROUP BY user_id, merged_book_id
    ),
    pairs AS (
      SELECT other.user_id, mine.merged_book_id, mine.rating AS my_rating,
        other.rating AS other_rating, other.rating - mine.rating AS diff
      FROM user_ratings mine
      JOIN user_ratings other
        ON other.merged_book_id = mine.merged_book_id AND other.user_id <> mine.user_id
      WHERE mine.user_id = ${userId}
    )
    SELECT pairs.user_id,
      count(*)::integer AS rated_count,
      (count(*) FILTER (WHERE diff = 0))::integer AS same,
      (count(*) FILTER (WHERE diff > 0))::integer AS higher,
      (count(*) FILTER (WHERE diff < 0))::integer AS lower,
      jsonb_object_agg(merged_book_id, jsonb_build_array(my_rating, other_rating)) AS book_ratings,
      avg(diff)::float8 AS avg_diff,
      avg(abs(diff))::float8 AS avg_abs_diff,
      max(ra.score)::float8 AS affinity
    FROM pairs
    JOIN rating_affinity ra ON ra.user_id = ${userId} AND ra.other_id = pairs.user_id
    GROUP BY pairs.user_id
  `;
	const scale = await selectAffinityScale(sql);
	// totals and the scale go out to 2 decimals; the percentage uses the exact values
	const round2 = (n: number) => Math.round(n * 100) / 100;
	return {
		agreements: rows.map((row) => ({
			...row,
			affinity: round2(row.affinity),
			affinity_percent: affinityPercent(row.affinity, scale),
		})),
		scale: round2(scale),
	};
};

// 相性 as a percentage: the points total on a logistic curve, 50% for no evidence either way,
// at most 99% (never a perfect match). The curve's scale follows the group: the top 5% of pairs
// (the 95th percentile of rating_affinity) show 80%, so as members rate more and totals grow,
// percentages don't creep toward 99%. AFFINITY_MIN_SCALE keeps it from collapsing while few
// pairs exist.
const AFFINITY_REFERENCE_PERCENTILE = 0.95;
const AFFINITY_REFERENCE_PERCENT = 0.8;
const AFFINITY_MIN_SCALE = 10;

export const selectAffinityScale = async (sql: postgres.Sql<{}>): Promise<number> => {
	const [row] = await sql<{ reference: number | null }[]>`
    SELECT percentile_cont(${AFFINITY_REFERENCE_PERCENTILE}) WITHIN GROUP (ORDER BY score)::float8
      AS reference
    FROM rating_affinity
    WHERE user_id < other_id
  `;
	const logit = Math.log(AFFINITY_REFERENCE_PERCENT / (1 - AFFINITY_REFERENCE_PERCENT));
	return Math.max((row?.reference ?? 0) / logit, AFFINITY_MIN_SCALE);
};

const affinityPercent = (score: number, scale: number): number =>
	Math.min(99, Math.round(100 / (1 + Math.exp(-score / scale))));
