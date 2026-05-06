import postgres from 'postgres';

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
): Promise<void> => {
	if (!Array.isArray(bookIds) || bookIds.length === 0) return;
	await sql`
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
    WHERE last_series_fetched IS NULL
       OR last_series_fetched < now() - interval '2 weeks'
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

export const insertSeriesMerge = async (
	sql: postgres.Sql<{}>,
	variantId: number,
	baseId: number
): Promise<void> => {
	await sql`
    INSERT INTO series_merges (variant_id, base_id)
    VALUES (${variantId}, ${baseId})
    ON CONFLICT (variant_id) DO UPDATE SET base_id = EXCLUDED.base_id
  `;
};

export const applySeriesMerges = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    UPDATE books
    SET series_id = sm.base_id
    FROM series_merges sm
    WHERE books.series_id = sm.variant_id
  `;
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
	read_count: number;
};

export type SeriesPageResponse = {
	series: SeriesRow;
	books: SeriesBookRow[];
	users: Record<string, { id: number; name: string | null; avatar_url: string | null }>;
	total_count: number;
	read_count: number;
	total_reads_count: number;
};

export const selectBooksForSeriesPage = async (
	sql: postgres.Sql<{}>,
	seriesId: number
): Promise<Omit<SeriesPageResponse, 'series'>> => {
	const bookRows = await sql<(SeriesBookRow & { user_ids: number[] | null })[]>`
    WITH canonical AS (
      SELECT DISTINCT COALESCE(fm.base_id, b.id) AS id
      FROM books b
      LEFT JOIN final_book_merges fm ON fm.variant_id = b.id
      WHERE b.series_id = ${seriesId}
    )
    SELECT
      b.id, b.title, b.author, b.author_url, b.page, b.thumbnail_url, b.series_id,
      s.name AS series_name,
      COUNT(DISTINCT r.user_id)::int AS read_count
    FROM canonical c
    JOIN books b ON b.id = c.id
    LEFT JOIN series s ON s.id = b.series_id
    LEFT JOIN reads r ON r.merged_book_id = b.id
    GROUP BY b.id, s.name
    ORDER BY b.id ASC
  `;

	const bookIds = bookRows.map((b) => b.id).filter((id) => bookRows.find(b => b.id === id)?.read_count ?? 0 > 0);

	const userRows = bookIds.length > 0
		? await sql<{ id: number; name: string | null; avatar_url: string | null; book_id: number }[]>`
        SELECT users.id, users.name, users.avatar_url, reads.merged_book_id AS book_id
        FROM users
        JOIN reads ON reads.user_id = users.id
        WHERE reads.merged_book_id IN ${sql(bookIds)}
      `
		: [];

	const users: SeriesPageResponse['users'] = {};
	const bookUserIds: Record<number, number[]> = {};
	userRows.forEach((u) => {
		users[u.id] = { id: u.id, name: u.name, avatar_url: u.avatar_url };
		if (!bookUserIds[u.book_id]) bookUserIds[u.book_id] = [];
		bookUserIds[u.book_id].push(u.id);
	});

	const books = bookRows.map((b) => ({ ...b, user_ids: [...new Set(bookUserIds[b.id] ?? [])] }));

	const read_count = books.filter((b) => b.read_count > 0).length;
	const total_reads_count = books.reduce((sum, b) => sum + b.read_count, 0);

	return { books, users, total_count: books.length, read_count, total_reads_count };
};

export const deleteOrphanSeries = async (sql: postgres.Sql<{}>): Promise<void> => {
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
