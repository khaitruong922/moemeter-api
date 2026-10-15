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
	// 相性 (docs/affinity): average points per book both rated, for sorting, and as a percentage,
	// for display
	affinity: number;
	affinity_percent: number;
};

export const selectRatingAgreementsOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<RatingAgreement[]> => {
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
	// the average goes out to 2 decimals; the percentage uses the exact value
	return rows.map((row) => {
		const average = affinityAverage(row.affinity, row.rated_count);
		return {
			...row,
			affinity: Math.round(average * 100) / 100,
			affinity_percent: affinityPercent(average),
		};
	});
};

// 相性 from a pair's points total (rating_affinity.score) over the books both rated: the average
// points per book, as if AFFINITY_NEUTRAL_BOOKS books worth 0 points were added, so a few shared
// books stay near 50% and more books bring it toward the pair's real average. It depends only on
// the two readers' own ratings: no group statistic, so new members or other pairs never move it,
// and it doesn't creep up as people rate more.
//
// For display the average goes on a logistic curve: 0 is 50%, at most 99%. AFFINITY_STEEPNESS 1.5:
// at 1.3, which matched the earlier total-based score's spread, a strong pair (Cyn × つー, 57%
// identical over 51 books) read only 88%. At 1.5 it shows 91%, 95% takes 19 identical books, and
// 99% (133 identical books) stays effectively out of reach.
const AFFINITY_NEUTRAL_BOOKS = 10;
const AFFINITY_STEEPNESS = 1.5;
// Below 50% the curve is half as steep. A book can lose up to 6 points but earn at most 3, so with
// one steepness 1% took 9 books all 5★ vs 1★ while 99% took 133 identical ones. Halved, 1% also
// needs about 133 books of the worst clash. Only the shown percentage changes; the order doesn't.
const AFFINITY_STEEPNESS_BELOW = AFFINITY_STEEPNESS / 2;

const affinityAverage = (score: number, ratedCount: number): number =>
	score / (ratedCount + AFFINITY_NEUTRAL_BOOKS);

const affinityPercent = (average: number): number => {
	const steepness = average >= 0 ? AFFINITY_STEEPNESS : AFFINITY_STEEPNESS_BELOW;
	return Math.min(99, Math.round(100 / (1 + Math.exp(-steepness * average))));
};
