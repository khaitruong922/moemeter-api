import postgres from 'postgres';
import { User } from './models';

export const selectAllUsers = async (sql: postgres.Sql<{}>): Promise<User[]> => {
	const rows = await sql<User[]>`
    SELECT id, name, avatar_url, books_read, pages_read
    FROM users
    ORDER BY books_read DESC NULLS LAST
  `;

	return rows;
};

export const selectUserByIds = async (sql: postgres.Sql<{}>, ids: number[]): Promise<User[]> => {
	if (ids.length === 0) return [];
	const rows = await sql<User[]>`
    SELECT id, name, avatar_url, books_read, pages_read
    FROM users
    WHERE id IN ${sql(ids)}
  `;
	return rows;
};

export const upsertUser = async (sql: postgres.Sql<{}>, user: User): Promise<void> => {
	await sql`
    INSERT INTO users ${sql(user)}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url,
      books_read = EXCLUDED.books_read,
      pages_read = EXCLUDED.pages_read
  `;
};

export const userExists = async (sql: postgres.Sql<{}>, userId: number): Promise<boolean> => {
	const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM users WHERE id = ${userId}
    ) AS exists
  `;
	return rows[0]?.exists ?? false;
};
