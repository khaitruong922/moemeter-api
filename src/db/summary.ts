import postgres from 'postgres';
import { getYearPeriod } from '../utils/period';
import { Book, BookWithReadId, User } from './models';

export type TotalReadsAndPages = {
	total_reads: number;
	total_pages: number;
};
export const getTotalReadsAndPagesOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number,
	startDate: Date,
	endDate: Date
): Promise<TotalReadsAndPages> => {
	// Get all reads for user in the year
	const reads = await sql<TotalReadsAndPages[]>`
		SELECT COUNT(1) AS total_reads, SUM(books.page) AS total_pages
		FROM reads
		JOIN books ON reads.merged_book_id = books.id
		WHERE user_id = ${userId} AND reads.date IS NOT NULL AND reads.date >= ${startDate} AND reads.date <= ${endDate}
	`;
	const total_reads = Number(reads[0]?.total_reads || 0);
	const total_pages = Number(reads[0]?.total_pages || 0);
	return { total_reads, total_pages };
};

type PeakMonthBooks = {
	month: number;
	total_pages: number;
	reads: BookWithReadId[];
};
export const getPeakMonthBooksOfUser = async (
	sql: postgres.Sql<{}>,
	userId: number,
	startDate: Date,
	endDate: Date
): Promise<PeakMonthBooks | null> => {
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
	const reads = await sql<BookWithReadId[]>`
			SELECT r.id as read_id, b.*
			FROM books b
			JOIN reads r ON r.merged_book_id = b.id
			WHERE r.user_id = ${userId} AND r.date IS NOT NULL AND EXTRACT(MONTH FROM r.date) = ${month}
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
        JOIN (SELECT merged_book_id FROM reads WHERE user_id = ${userId}) AS user_reads ON r.merged_book_id = user_reads.merged_book_id
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
        )
        ORDER BY r.date ASC
    `;
	return {
		user,
		total_pages: Number(bestFriend.total_pages),
		reads,
	};
};
