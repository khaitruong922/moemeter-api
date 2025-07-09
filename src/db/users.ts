import postgres from 'postgres';
import { SyncStatus, User } from './models';

type RankedUser = User & {
	rank: number | string;
};

export const selectAllUsersWithRank = async (sql: postgres.Sql<{}>): Promise<RankedUser[]> => {
	const rows = await sql<RankedUser[]>`
    WITH ranked_users AS (
      SELECT id, name, avatar_url, books_read, pages_read,
            RANK() OVER (ORDER BY books_read DESC, pages_read DESC) AS rank
      FROM users
    )
    SELECT * FROM ranked_users
    ORDER BY rank;
  `;

	return rows.map((r) => ({ ...r, rank: Number(r.rank) }));
};

export type SelectAllUsersParams = {
	syncStatus: SyncStatus | null;
	bookCountOrder: 'ASC' | 'DESC';
	limit: number | null;
};

export const selectAllUsers = async (
	sql: postgres.Sql<{}>,
	params: SelectAllUsersParams
): Promise<User[]> => {
	const { syncStatus, bookCountOrder, limit } = params;
	const statusCondition = syncStatus ? sql`WHERE sync_status = ${syncStatus}` : sql``;
	const orderCondition =
		bookCountOrder === 'ASC' ? sql`ORDER BY books_read ASC` : sql`ORDER BY books_read DESC`;
	const limitCondition = limit ? sql`LIMIT ${limit}` : sql``;
	const rows = await sql<User[]>`
    SELECT *
    FROM users
    ${statusCondition}
    ${orderCondition}
    ${limitCondition}
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
      pages_read = EXCLUDED.pages_read,
      bookcase = EXCLUDED.bookcase,
      original_books_read = EXCLUDED.original_books_read,
      original_pages_read = EXCLUDED.original_pages_read
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

export const selectFailedAndTotalUsers = async (
	sql: postgres.Sql<{}>
): Promise<{ failed_users: number; total_users: number }> => {
	const rows = await sql<{ failed_users: number; total_users: number }[]>`
    SELECT
      COUNT(*) FILTER (WHERE sync_status = 'failed') AS failed_users,
      COUNT(*) AS total_users
    FROM users
  `;
	return {
		failed_users: Number(rows[0]?.failed_users ?? 0),
		total_users: Number(rows[0]?.total_users ?? 0),
	};
};
