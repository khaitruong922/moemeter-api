import postgres from 'postgres';
import { deleteOrphanReviews } from './reviews';
import { SyncStatus, User } from './models';
import { syncBookMerges } from './book_merges';

export type RankedUser = User & {
	rank: number | string;
	pages_rank: number | string;
};
export type RankOrder = 'books' | 'pages';

export type LonelyUser = User & {
	lonely_book_count: number | string;
	lonely_days: number | string;
	lonely_ratio: number | string;
	null_read_date_count: number | string;
	book_count_rank: number | string;
	days_rank: number | string;
};
export type LonelyOrder = 'days' | 'book_count' | 'ratio';

export type ReadingAffinityUser = User & {
	books_with_common_readers: number | string;
	affinity_points: number | string;
	avg_common_readers: number | string;
	rank: number | string;
	avg_readers_rank: number | string;
	books_rank: number | string;
};
export type ReadingAffinityOrder = 'points' | 'avg_readers' | 'books';

export const selectAllUsersWithRank = async (
	sql: postgres.Sql<{}>,
	order: RankOrder
): Promise<RankedUser[]> => {
	const rankField = order === 'pages' ? 'pages_rank' : 'rank';
	const rows = await sql<RankedUser[]>`
    SELECT * FROM ranked_users
    ORDER BY ${sql(rankField)};
  `;
	return rows.map((r) => ({ ...r, rank: Number(r.rank), pages_rank: Number(r.pages_rank) }));
};

export const selectYearlyLeaderboard = async (
	sql: postgres.Sql<{}>,
	order: RankOrder,
	user_id?: number
): Promise<RankedUser[]> => {
	const rankField = order === 'pages' ? 'pages_rank' : 'rank';
	const userCondition = user_id ? sql`WHERE user_id = ${user_id}` : sql``;
	const rows = await sql<RankedUser[]>`
    SELECT * FROM yearly_leaderboard
    ${userCondition}
    ORDER BY ${sql(rankField)};
  `;

	return rows.map((r) => ({
		...r,
		rank: Number(r.rank),
		pages_rank: Number(r.pages_rank),
		books_read: Number(r.books_read),
		pages_read: Number(r.pages_read),
	}));
};

export const selectLonelyLeaderboard = async (
	sql: postgres.Sql<{}>,
	order: LonelyOrder
): Promise<LonelyUser[]> => {
	const rankField = () => {
		if (order === 'days') return 'days_rank';
		if (order === 'book_count') return 'book_count_rank';
		if (order === 'ratio') return 'ratio_rank';
		return '';
	};
	const rows = await sql<LonelyUser[]>`
    SELECT * FROM lonely_leaderboard
    ORDER BY ${sql(rankField())} ASC;
  `;

	return rows.map((r) => ({
		...r,
		lonely_book_count: Number(r.lonely_book_count),
		lonely_days: Number(r.lonely_days),
		lonely_ratio: Number(r.lonely_ratio),
		null_read_date_count: Number(r.null_read_date_count),
		book_count_rank: Number(r.book_count_rank),
		days_rank: Number(r.days_rank),
	}));
};

export const selectReadingAffinityLeaderboard = async (
	sql: postgres.Sql<{}>,
	order: ReadingAffinityOrder
): Promise<ReadingAffinityUser[]> => {
	const rankField = () => {
		if (order === 'points') return 'rank';
		if (order === 'avg_readers') return 'avg_readers_rank';
		if (order === 'books') return 'books_rank';
		return 'rank';
	};

	const rows = await sql<ReadingAffinityUser[]>`
    SELECT * FROM reading_affinity_leaderboard
    ORDER BY ${sql(rankField())} ASC;
  `;

	return rows.map((r) => ({
		...r,
		books_with_common_readers: Number(r.books_with_common_readers),
		affinity_points: Number(r.affinity_points),
		avg_common_readers: Number(r.avg_common_readers),
		rank: Number(r.rank),
		avg_readers_rank: Number(r.avg_readers_rank),
		books_rank: Number(r.books_rank),
	}));
};

export const refreshYearlyLeaderboard = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    REFRESH MATERIALIZED VIEW yearly_leaderboard;
  `;
};

export const refreshRankedUsers = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
	REFRESH MATERIALIZED VIEW ranked_users;
  `;
};

export const refreshLonelyLeaderboard = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    REFRESH MATERIALIZED VIEW lonely_leaderboard;
  `;
};

export const refreshReadingAffinityLeaderboard = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    REFRESH MATERIALIZED VIEW reading_affinity_leaderboard;
  `;
};

export const refreshAll = async (sql: postgres.Sql<{}>): Promise<void> => {
	await syncBookMerges(sql);
	await refreshRankedUsers(sql);
	await refreshYearlyLeaderboard(sql);
	await refreshLonelyLeaderboard(sql);
	await refreshReadingAffinityLeaderboard(sql);
	await deleteOrphanReviews(sql);
};

export type SelectAllUsersParams = {
	syncStatus: SyncStatus | null;
	bookCountOrder: 'ASC' | 'DESC';
	limit: number | null;
};

export const selectAllUsersForSync = async (
	sql: postgres.Sql<{}>,
	params: SelectAllUsersParams
): Promise<User[]> => {
	const { syncStatus, bookCountOrder, limit } = params;
	const statusCondition = syncStatus ? sql`WHERE sync_status = ${syncStatus}` : sql``;
	const orderCondition =
		bookCountOrder === 'ASC'
			? sql`ORDER BY COALESCE(original_books_read, books_read) ASC`
			: sql`ORDER BY COALESCE(original_books_read, books_read) DESC`;
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

export const selectRankedUserById = async (
	sql: postgres.Sql<{}>,
	userId: number
): Promise<RankedUser | null> => {
	const rows = await sql<RankedUser[]>`
    SELECT *
    FROM ranked_users
    WHERE id = ${userId}
  `;
	const user = rows[0];
	if (!user) return null;
	return {
		...user,
		rank: Number(user.rank),
		pages_rank: Number(user.pages_rank),
	};
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
	delete user.reviews_count;
	await sql`
    INSERT INTO users ${sql(user)}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url,
      books_read = EXCLUDED.books_read,
      pages_read = EXCLUDED.pages_read,
      bookcase = EXCLUDED.bookcase,
      original_books_read = EXCLUDED.original_books_read,
      original_pages_read = EXCLUDED.original_pages_read,
      registration_date = EXCLUDED.registration_date,
      first_log_date = EXCLUDED.first_log_date
  `;
};

export const deleteUserById = async (sql: postgres.Sql<{}>, userId: number): Promise<void> => {
	await sql`DELETE FROM reads WHERE user_id = ${userId}`;
	await sql`DELETE FROM users WHERE id = ${userId}`;
	await sql`REFRESH MATERIALIZED VIEW ranked_users`;
	await sql`REFRESH MATERIALIZED VIEW yearly_leaderboard`;
};

export const updateUserNameAndAvatarUrl = async (
	sql: postgres.Sql<{}>,
	userId: number,
	name: string | null,
	avatarUrl: string | null
): Promise<void> => {
	await sql`
    UPDATE users
    SET name = ${name}, avatar_url = ${avatarUrl}
    WHERE id = ${userId}
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
