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

export const deleteReadsOfUser = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	await sql`
    DELETE FROM reads WHERE user_id = ${userId}
  `;
};
