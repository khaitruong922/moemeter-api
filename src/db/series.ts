import postgres from 'postgres';
import { BookReview } from './books';
import { selectReviewsByIds } from './reviews';
import { refreshAll } from './users';

export const upsertSeries = async (
	sql: postgres.Sql<{}>,
	series: { id: number; name: string }
): Promise<void> => {
	await sql`
    INSERT INTO series (id, name)
    VALUES (${series.id}, ${series.name})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `;
};

export const updateSeriesIdForBookAndVariants = async (
	sql: postgres.Sql<{}>,
	bookIds: number[],
	seriesId: number
): Promise<number[]> => {
	if (!Array.isArray(bookIds) || bookIds.length === 0) return [];
	const rows = await sql<{ id: number }[]>`
    WITH series_bases AS (
      SELECT COALESCE(fm.base_id, b.id) AS base_id
      FROM books b
      LEFT JOIN final_book_merges fm ON fm.variant_id = b.id
      WHERE b.id IN ${sql(bookIds)}
    ),
    all_related AS (
      SELECT base_id AS book_id FROM series_bases
      UNION
      SELECT fm.variant_id FROM final_book_merges fm
      JOIN series_bases sb ON fm.base_id = sb.base_id
    )
    UPDATE books SET series_id = ${seriesId}
    WHERE id IN (SELECT book_id FROM all_related)
    RETURNING id
  `;
	return rows.map((r) => r.id);
};

export const propagateSeriesNumbers = async (
	sql: postgres.Sql<{}>,
	bookIds: number[]
): Promise<void> => {
	if (bookIds.length === 0) return;
	await sql`
    UPDATE books
    SET series_number = base.series_number
    FROM books base
    JOIN final_book_merges fm ON fm.base_id = base.id
    WHERE books.id = fm.variant_id
      AND books.id IN ${sql(bookIds)}
      AND base.series_number IS NOT NULL
      AND books.series_number IS NULL
  `;
	await sql`
    UPDATE books
    SET series_number = v.series_number
    FROM books v
    JOIN final_book_merges fm ON fm.variant_id = v.id
    WHERE books.id = fm.base_id
      AND books.id IN ${sql(bookIds)}
      AND v.series_number IS NOT NULL
      AND books.series_number IS NULL
  `;
};

export const fixOrphanSeriesNumbers = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    UPDATE books
    SET series_number = base.series_number
    FROM books base
    JOIN final_book_merges fm ON fm.base_id = base.id
    WHERE books.id = fm.variant_id
      AND books.series_id IS NOT NULL
      AND base.series_number IS NOT NULL
      AND books.series_number IS NULL
  `;
	await sql`
    UPDATE books
    SET series_number = v.series_number
    FROM books v
    JOIN final_book_merges fm ON fm.variant_id = v.id
    WHERE books.id = fm.base_id
      AND books.series_id IS NOT NULL
      AND v.series_number IS NOT NULL
      AND books.series_number IS NULL
  `;
};

export type BookForSeriesFetch = {
	id: number;
	series_id: number | null;
	last_series_fetched: Date | null;
};

export const selectBooksNeedingSeriesFetch = async (
	sql: postgres.Sql<{}>,
	limit: number
): Promise<BookForSeriesFetch[]> => {
	return await sql<BookForSeriesFetch[]>`
    SELECT id, series_id, last_series_fetched FROM books
    WHERE (last_series_fetched IS NULL
       OR last_series_fetched < now() - interval '2 weeks')
      AND id NOT IN (SELECT id FROM blacklisted_books)
    ORDER BY last_series_fetched ASC NULLS FIRST
    LIMIT ${limit}
  `;
};

export const markSeriesFetched = async (
	sql: postgres.Sql<{}>,
	bookIds: number[]
): Promise<void> => {
	if (!Array.isArray(bookIds) || bookIds.length === 0) return;
	await sql`
    UPDATE books SET last_series_fetched = now()
    WHERE id IN ${sql(bookIds)}
  `;
};

export const selectBlacklistedSeriesIds = async (sql: postgres.Sql<{}>): Promise<Set<number>> => {
	const rows = await sql<{ id: number }[]>`SELECT id FROM blacklisted_series`;
	return new Set(rows.map((r) => r.id));
};

export const blacklistSeriesIds = async (
	sql: postgres.Sql<{}>,
	seriesIds: number[]
): Promise<void> => {
	if (seriesIds.length === 0) return;
	await sql`
    INSERT INTO blacklisted_series ${sql(seriesIds.map((id) => ({ id })))}
    ON CONFLICT DO NOTHING
  `;
	await sql`
    UPDATE books SET series_id = NULL, series_number = NULL
    WHERE series_id IN ${sql(seriesIds)}
  `;
	await sql`DELETE FROM series WHERE id IN ${sql(seriesIds)}`;
	await refreshAll(sql);
};

export type SeriesWithMultipleAuthors = {
	id: number;
	name: string;
	author_count: number;
	author_distribution: { author: string; count: number }[];
};

export const selectSeriesWithMultipleAuthors = async (
	sql: postgres.Sql<{}>
): Promise<SeriesWithMultipleAuthors[]> => {
	const rows = await sql<
		{ id: number; name: string; author_count: number; author_distribution: string }[]
	>`
    WITH author_counts AS (
      SELECT
        series_id,
        remove_spaces(author) AS author,
        COUNT(*)::int AS book_count
      FROM books
      WHERE author IS NOT NULL AND series_id IS NOT NULL
      GROUP BY series_id, remove_spaces(author)
    ),
    series_multi AS (
      SELECT series_id, COUNT(*)::int AS author_count
      FROM author_counts
      GROUP BY series_id
      HAVING COUNT(*) > 1
    )
    SELECT
      s.id,
      s.name,
      sm.author_count,
      jsonb_agg(jsonb_build_object('author', ac.author, 'count', ac.book_count) ORDER BY ac.book_count DESC) AS author_distribution
    FROM series s
    JOIN series_multi sm ON sm.series_id = s.id
    JOIN author_counts ac ON ac.series_id = s.id
    GROUP BY s.id, s.name, sm.author_count
    ORDER BY sm.author_count DESC, s.name
  `;
	return rows.map((r) => ({
		...r,
		author_distribution:
			typeof r.author_distribution === 'string'
				? JSON.parse(r.author_distribution)
				: r.author_distribution,
	}));
};

export type SeriesRow = { id: number; name: string };

export const selectSeriesById = async (
	sql: postgres.Sql<{}>,
	seriesId: number
): Promise<SeriesRow | null> => {
	const rows = await sql<SeriesRow[]>`
    SELECT id, name FROM series WHERE id = ${seriesId}
  `;
	return rows[0] ?? null;
};

type SeriesBookRow = {
	id: number;
	title: string | null;
	author: string | null;
	author_url: string | null;
	page: number | null;
	thumbnail_url: string | null;
	series_id: number | null;
	series_name: string | null;
	series_number: number | null;
	read_count: number;
};

export type SeriesStats = {
	total_book_count: number;
	read_count: number;
	total_reads_count: number;
	total_pages: number;
};

export type SeriesPageResponse = {
	series: SeriesRow;
	books: SeriesBookRow[];
	users: Record<string, { id: number; name: string | null; avatar_url: string | null }>;
} & SeriesStats;

export const selectSeriesStats = async (
	sql: postgres.Sql<{}>,
	seriesId: number
): Promise<SeriesStats | null> => {
	const rows = await sql<SeriesStats[]>`
    SELECT total_book_count, read_count, total_reads_count, total_pages
    FROM series_leaderboard WHERE id = ${seriesId}
  `;
	if (!rows[0]) return null;
	const r = rows[0];
	return {
		total_book_count: Number(r.total_book_count),
		read_count: Number(r.read_count),
		total_reads_count: Number(r.total_reads_count),
		total_pages: Number(r.total_pages),
	};
};

export const selectBooksForSeriesPage = async (
	sql: postgres.Sql<{}>,
	seriesId: number
): Promise<{
	books: (SeriesBookRow & { user_ids: number[]; reviews: BookReview[] })[];
	users: SeriesPageResponse['users'];
}> => {
	const bookRows = await sql<(SeriesBookRow & { user_ids: number[] | null })[]>`
    WITH canonical AS (
      SELECT DISTINCT COALESCE(fm.base_id, b.id) AS id
      FROM books b
      LEFT JOIN final_book_merges fm ON fm.variant_id = b.id
      WHERE b.series_id = ${seriesId}
    )
    SELECT
      b.id, b.title, b.author, b.author_url, b.page, b.thumbnail_url, b.series_id,
      b.series_number,
      s.name AS series_name,
      COUNT(DISTINCT r.user_id)::int AS read_count
    FROM canonical c
    JOIN books b ON b.id = c.id
    LEFT JOIN series s ON s.id = b.series_id
    LEFT JOIN reads r ON r.merged_book_id = b.id
    GROUP BY b.id, s.name
    ORDER BY b.series_number ASC NULLS LAST, b.id ASC
  `;

	const bookIds = bookRows
		.map((b) => b.id)
		.filter((id) => bookRows.find((b) => b.id === id)?.read_count ?? 0 > 0);

	const userRows =
		bookIds.length > 0
			? await sql<
					{
						id: number;
						name: string | null;
						avatar_url: string | null;
						book_id: number;
						read_id: number;
					}[]
				>`
        SELECT users.id, users.name, users.avatar_url, reads.merged_book_id AS book_id, reads.id AS read_id
        FROM users
        JOIN reads ON reads.user_id = users.id
        WHERE reads.merged_book_id IN ${sql(bookIds)}
      `
			: [];

	const users: SeriesPageResponse['users'] = {};
	const bookUserIds: Record<number, number[]> = {};
	const readIds: number[] = [];
	userRows.forEach((u) => {
		users[u.id] = { id: u.id, name: u.name, avatar_url: u.avatar_url };
		if (!bookUserIds[u.book_id]) bookUserIds[u.book_id] = [];
		bookUserIds[u.book_id].push(u.id);
		readIds.push(u.read_id);
	});

	const bookReviews = await selectReviewsByIds(sql, readIds);
	const bookReviewsMap: Record<number, BookReview[]> = {};
	bookReviews.forEach((r) => {
		if (!bookReviewsMap[r.book_id]) bookReviewsMap[r.book_id] = [];
		bookReviewsMap[r.book_id].push(r);
	});

	const books = bookRows.map((b) => ({
		...b,
		user_ids: [...new Set(bookUserIds[b.id] ?? [])],
		reviews: bookReviewsMap[b.id] ?? [],
	}));

	return { books, users };
};

export type SeriesLeaderboardOrder = 'reads' | 'read_count' | 'book_count' | 'pages';

export type SeriesLeaderboardEntry = {
	id: number;
	name: string;
	total_book_count: number;
	read_count: number;
	total_reads_count: number;
	total_pages: number;
	reads_rank: number;
	read_count_rank: number;
	book_count_rank: number;
	pages_rank: number;
	cover_url: string | null;
};

export const selectSeriesLeaderboard = async (
	sql: postgres.Sql<{}>,
	order: SeriesLeaderboardOrder
): Promise<SeriesLeaderboardEntry[]> => {
	const rankField =
		order === 'read_count'
			? 'read_count_rank'
			: order === 'book_count'
				? 'book_count_rank'
				: order === 'pages'
					? 'pages_rank'
					: 'reads_rank';
	const rows = await sql<SeriesLeaderboardEntry[]>`
    SELECT sl.*,
      (
        SELECT b.thumbnail_url FROM books b
        WHERE b.series_id = sl.id
        ORDER BY b.series_number ASC NULLS LAST, b.id ASC
        LIMIT 1
      ) AS cover_url
    FROM series_leaderboard sl
    ORDER BY ${sql(rankField)} ASC;
  `;
	return rows.map((r) => ({
		...r,
		total_book_count: Number(r.total_book_count),
		read_count: Number(r.read_count),
		total_reads_count: Number(r.total_reads_count),
		total_pages: Number(r.total_pages),
		reads_rank: Number(r.reads_rank),
		read_count_rank: Number(r.read_count_rank),
		book_count_rank: Number(r.book_count_rank),
		pages_rank: Number(r.pages_rank),
	}));
};

export const refreshSeriesLeaderboard = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    REFRESH MATERIALIZED VIEW series_leaderboard;
  `;
};

export type UserSeriesBookRow = {
	book_id: number;
	title: string | null;
	thumbnail_url: string | null;
	series_number: number | null;
	user_read: boolean;
};

export type UserSeriesEntryRow = {
	series_id: number;
	series_name: string;
	total_book_count: number;
	read_book_count: number;
	finished_at: string | null;
	books: UserSeriesBookRow[];
};

export type UserSeriesProgressResponse = {
	finished: UserSeriesEntryRow[];
	in_progress: UserSeriesEntryRow[];
};

export const selectUserSeriesProgress = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<UserSeriesProgressResponse> => {
	const rows = await sql<
		{
			series_id: number;
			series_name: string;
			total_book_count: number;
			read_book_count: number;
			finished_at: string | null;
			book_id: number;
			title: string | null;
			thumbnail_url: string | null;
			series_number: number | null;
			user_read: boolean;
		}[]
	>`
    WITH user_reads AS (
      SELECT merged_book_id, date FROM reads WHERE user_id = ${userId}
    ),
    canonical_books AS (
      SELECT
        b.series_id,
        COALESCE(fm.base_id, b.id) AS book_id
      FROM books b
      LEFT JOIN final_book_merges fm ON fm.variant_id = b.id
      WHERE b.series_id IS NOT NULL
    ),
    deduped AS (
      SELECT DISTINCT series_id, book_id FROM canonical_books
    ),
    series_books AS (
      SELECT
        d.series_id,
        d.book_id,
        b.title,
        b.thumbnail_url,
        b.series_number,
        (ur.merged_book_id IS NOT NULL) AS user_read,
        ur.date AS read_date
      FROM deduped d
      JOIN books b ON b.id = d.book_id
      LEFT JOIN user_reads ur ON ur.merged_book_id = d.book_id
    ),
    series_stats AS (
      SELECT
        series_id,
        COUNT(*)::int AS total_book_count,
        (COUNT(*) FILTER (WHERE user_read))::int AS read_book_count,
        MAX(read_date) AS finished_at
      FROM series_books
      GROUP BY series_id
      HAVING (COUNT(*) FILTER (WHERE user_read)) > 0
    )
    SELECT
      s.id AS series_id,
      s.name AS series_name,
      ss.total_book_count,
      ss.read_book_count,
      ss.finished_at::text,
      sb.book_id,
      sb.title,
      sb.thumbnail_url,
      sb.series_number,
      sb.user_read
    FROM series_stats ss
    JOIN series s ON s.id = ss.series_id
    JOIN series_books sb ON sb.series_id = ss.series_id
    ORDER BY ss.series_id, sb.series_number ASC NULLS LAST, sb.book_id ASC
  `;

	const seriesMap = new Map<number, UserSeriesEntryRow>();
	for (const row of rows) {
		if (!seriesMap.has(row.series_id)) {
			seriesMap.set(row.series_id, {
				series_id: row.series_id,
				series_name: row.series_name,
				total_book_count: Number(row.total_book_count),
				read_book_count: Number(row.read_book_count),
				finished_at: row.finished_at ?? null,
				books: [],
			});
		}
		seriesMap.get(row.series_id)!.books.push({
			book_id: row.book_id,
			title: row.title,
			thumbnail_url: row.thumbnail_url,
			series_number: row.series_number,
			user_read: row.user_read,
		});
	}

	const all = Array.from(seriesMap.values());
	return {
		finished: all.filter((s) => s.read_book_count === s.total_book_count),
		in_progress: all.filter((s) => s.read_book_count < s.total_book_count),
	};
};

export const deleteOrphanSeriesAndBooks = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    WITH orphan_series AS (
      SELECT s.id FROM series s
      WHERE NOT EXISTS (
        SELECT 1 FROM reads r
        INNER JOIN books b ON b.id = r.book_id
        WHERE b.series_id = s.id
      )
    ),
    deleted_series AS (
      DELETE FROM series WHERE id IN (SELECT id FROM orphan_series)
      RETURNING id
    )
    DELETE FROM books WHERE series_id IN (SELECT id FROM deleted_series)
  `;
};
