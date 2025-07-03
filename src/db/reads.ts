import postgres from 'postgres';
import { Read } from './models';

export const bulkUpsertReads = async (sql: postgres.Sql<{}>, reads: Read[]): Promise<void> => {
	await sql`
    INSERT INTO reads ${sql(reads)}
    ON CONFLICT (user_id, book_id) DO UPDATE SET
      date = EXCLUDED.date
  `;
};

export const selectCommonReadsOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<Read[]> => {
	const rows = await sql<Read[]>`
    WITH user_reads AS (
      SELECT book_id FROM reads WHERE user_id = ${userId}
    )
    SELECT reads.user_id, reads.book_id, reads.date
    FROM reads
    WHERE book_id IN (SELECT book_id FROM user_reads)
    AND user_id != ${userId}
    ORDER BY book_id, user_id
  `;
	return rows;
};

export const deleteReadsOfUser = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	await sql`
    DELETE FROM reads WHERE user_id = ${userId}
  `;
};
