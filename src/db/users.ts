import postgres from 'postgres';
import { SyncStatus, User } from './models';

export const selectAllUsers = async (sql: postgres.Sql<{}>): Promise<User[]> => {
	const rows = await sql<User[]>`
    SELECT id, name, avatar_url, books_read, pages_read, sync_status
    FROM users
    ORDER BY books_read DESC, pages_read DESC
    WHERE books_read IS NOT NULL
  `;

	return rows;
};

export const selectUserById = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<User | null> => {
	const rows = await sql<User[]>`
    SELECT id, name, avatar_url, books_read, pages_read
    FROM users
    WHERE id = ${userId}
  `;
	return rows[0] ?? null;
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

export const updateSyncStatusByUserIds = async (
	sql: postgres.Sql<{}>,
	userIds: number[],
	status: SyncStatus
): Promise<void> => {
	if (userIds.length === 0) return;
	await sql`
    UPDATE users
    SET sync_status = ${status}
    WHERE id IN ${sql(userIds)}
  `;
};
