import postgres from 'postgres';
import { deleteReadsOfBook } from './reads';
import { refreshAll } from './users';

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
    ON CONFLICT (id) DO NOTHING
  `;
	// Remove reads that were already imported before the book was blacklisted, so the
	// book is excluded immediately rather than only after each user's next full sync.
	await deleteReadsOfBook(sql, bookId);
	await refreshAll(sql);
};

export const removeBlacklistedBook = async (
	sql: postgres.Sql<{}>,
	bookId: number
): Promise<void> => {
	await sql`
    DELETE FROM blacklisted_books WHERE id = ${bookId}
  `;
	await refreshAll(sql);
};
