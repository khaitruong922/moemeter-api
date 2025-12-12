import postgres from 'postgres';
import { getMonthPeriod, getYearPeriod } from '../utils/period';
import { BookWithReadId, User } from './models';
import { RankedUser } from './users';

export type TotalReadsAndPages = {
	total_reads: number;
	total_pages: number;
	rank: number;
};
export const getRankedUserInPeriod = async (
	sql: postgres.Sql<{}>,
	userId: number,
	startDate: Date,
	endDate: Date
): Promise<RankedUser> => {
	const users = await sql<RankedUser[]>`
		WITH user_stats AS (
			SELECT
				user_id,
				COUNT(1) AS books_read,
				SUM(books.page) AS pages_read
			FROM reads
			JOIN books ON reads.merged_book_id = books.id
			WHERE reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate}
			GROUP BY user_id
		),
		ranked_users AS (
			SELECT
				user_id,
				books_read,
				pages_read,
				RANK() OVER (ORDER BY books_read DESC, pages_read DESC) AS rank,
        RANK() OVER (ORDER BY pages_read DESC, books_read DESC) AS pages_rank
			FROM user_stats
		)
		SELECT u.id, u.name, u.avatar_url, ru.books_read, ru.pages_read, ru.rank, ru.pages_rank
		FROM ranked_users ru
    JOIN users u ON ru.user_id = u.id
		WHERE user_id = ${userId}
	`;

	const user = users[0];
	if (!user) throw new Error(`User with ID ${userId} not found in the specified period.`);

	const total_reads = Number(user?.books_read || 0);
	const total_pages = Number(user?.pages_read || 0);
	const rank = Number(user?.rank || 0);
	const pages_rank = Number(user?.pages_rank || 0);

	return {
		...user,
		books_read: total_reads,
		pages_read: total_pages,
		rank,
		pages_rank,
	};
};

type PeakMonthBooks = {
	month: number;
	total_pages: number;
	reads: BookWithReadId[];
};
export const getPeakMonthBooksOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number,
	year: number
): Promise<PeakMonthBooks | null> => {
	const [startDate, endDate] = getYearPeriod(year);
	const peakMonths = await sql`
		SELECT EXTRACT(MONTH FROM r.date) AS month, COUNT(1) AS read_count, SUM(b.page) AS total_pages
		FROM reads r
		JOIN books b ON r.merged_book_id = b.id
		WHERE r.user_id = ${userId} AND r.date IS NOT NULL AND r.date >= ${startDate} AND r.date <= ${endDate}
		GROUP BY month
		ORDER BY read_count DESC, total_pages DESC
		LIMIT 1
	`;

	if (peakMonths.length === 0) return null;
	const peakMonth = peakMonths[0];
	if (Number(peakMonth.read_count) === 0) return null;

	const month = Number(peakMonth.month);
	const [monthStart, monthEnd] = getMonthPeriod(year, month);
	const reads = await sql<BookWithReadId[]>`
			SELECT r.id as read_id, b.*
			FROM books b
			JOIN reads r ON r.merged_book_id = b.id
			WHERE r.user_id = ${userId} AND r.date IS NOT NULL AND r.date >= ${monthStart} AND r.date <= ${monthEnd}
			ORDER BY r.date ASC
		`;
	return {
		month,
		total_pages: Number(peakMonth.total_pages),
		reads,
	};
};

type BestFriend = {
	user: User;
	total_pages: number;
	reads: BookWithReadId[];
};
export const getBestFriendReads = async (
	sql: postgres.Sql<{}>,
	userId: number,
	startDate: Date,
	endDate: Date
): Promise<BestFriend | null> => {
	const bestFriends = await sql`
        SELECT r.user_id, COUNT(1) AS read_count, SUM(b.page) AS total_pages
        FROM reads r
        JOIN (
            SELECT merged_book_id FROM reads WHERE user_id = ${userId} 
            AND date IS NOT NULL AND date >= ${startDate} AND date <= ${endDate}
        ) AS user_reads ON r.merged_book_id = user_reads.merged_book_id
        JOIN books b ON r.merged_book_id = b.id
        WHERE user_id != ${userId}
        AND r.date IS NOT NULL AND r.date >= ${startDate} AND r.date <= ${endDate}
        GROUP BY r.user_id
        ORDER BY read_count DESC, total_pages DESC
        LIMIT 1
    `;
	if (bestFriends.length === 0) return null;
	const bestFriend = bestFriends[0];
	if (Number(bestFriend.read_count) === 0) return null;
	const bestFriendId = Number(bestFriend.user_id);
	const userRows = await sql<User[]>`
        SELECT id, name, avatar_url
        FROM users
        WHERE id = ${bestFriendId}
    `;
	const user = userRows[0];
	const reads = await sql<BookWithReadId[]>`
        SELECT r.id as read_id, b.*
        FROM books b
        JOIN reads r ON r.merged_book_id = b.id
        WHERE r.user_id = ${bestFriendId}
        AND r.date IS NOT NULL AND r.date >= ${startDate} AND r.date <= ${endDate}
        AND r.merged_book_id IN (
            SELECT merged_book_id
            FROM reads
            WHERE user_id = ${userId} 
            AND date IS NOT NULL AND date >= ${startDate} AND date <= ${endDate}
        )
        ORDER BY r.date ASC
    `;
	return {
		user,
		total_pages: Number(bestFriend.total_pages),
		reads,
	};
};
