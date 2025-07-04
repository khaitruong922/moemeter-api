import postgres from 'postgres';
import { Read } from './models';

export const bulkUpsertReads = async (sql: postgres.Sql<{}>, reads: Read[]): Promise<void> => {
	await sql`
    INSERT INTO reads ${sql(reads)}
    ON CONFLICT (user_id, book_id) DO NOTHING
  `;
};

export const selectCommonReadsOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<Read[]> => {
	const rows = await sql<Read[]>`
    SELECT r.user_id, r.book_id
    FROM reads r
    JOIN (SELECT book_id FROM reads WHERE user_id = ${userId}) AS user_reads ON r.book_id = user_reads.book_id
    WHERE user_id != ${userId}
  `;
	return rows;
};

export const deleteReadsOfUser = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	await sql`
    DELETE FROM reads WHERE user_id = ${userId}
  `;
};
