import postgres from 'postgres';

export const selectBlacklistedBookIds = async (sql: postgres.Sql<{}>): Promise<Set<number>> => {
	const rows = await sql<{ id: number }[]>`
    SELECT id FROM blacklisted_books
  `;
	return new Set(rows.map((r) => r.id));
};

export const addBlacklistedBook = async (sql: postgres.Sql<{}>, bookId: number): Promise<void> => {
	await sql`
    INSERT INTO blacklisted_books (id)
    VALUES (${bookId})
  `;
};

export const removeBlacklistedBook = async (
	sql: postgres.Sql<{}>,
	bookId: number
): Promise<void> => {
	await sql`
    DELETE FROM blacklisted_books WHERE id = ${bookId}
  `;
};
