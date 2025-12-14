import { Hono } from 'hono';
import { fullImportUser } from '../core/user';
import { createDbClientFromEnv } from '../db';
import { syncBookMerges } from '../db/book_merges';
import { BookReview, selectBookByIds, selectLonelyBooksOfUser } from '../db/books';
import { selectCommonReadsOfUser } from '../db/reads';
import { deleteOrphanReviews, selectReviewsByIds } from '../db/reviews';
import { getBestFriendReads, getPeakMonthBooksOfUser, getRankedUserInPeriod } from '../db/summary';
import {
	RankedUser,
	refreshYearlyLeaderboard,
	selectAllUsersWithRank,
	selectUserById,
	selectUserByIds,
	selectYearlyLeaderboard,
	updateSyncStatusByUserIds,
	userExists,
} from '../db/users';
import { validateGroupAuth } from '../middlewares/auth';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../scraping/user';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';
import { getYearPeriod } from '../utils/period';

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();

app.get('/leaderboard', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const period = c.req.query('period');
	const rankOrder = c.req.query('order') === 'pages' ? 'pages' : 'books';
	let users: RankedUser[];
	if (period === 'this_year') {
		users = await selectYearlyLeaderboard(sql, rankOrder);
	} else {
		users = await selectAllUsersWithRank(sql, rankOrder);
	}

	return c.json(users);
});

app.get('/:userId', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || isNaN(Number(userId))) {
		return c.json({ error: '無効なユーザーIDです' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	const user = await selectUserById(sql, Number(userId));
	if (user === null) {
		return c.json({ error: 'ユーザーが見つかりません' }, 404);
	}
	return c.json(user);
});

app.post('/join', validateGroupAuth, async (c) => {
	const { user_id, bookcase } = await c.req.json();

	if (!user_id || typeof user_id !== 'number') {
		return c.json({ error: 'user_idは必須で、数値である必要があります' }, 400);
	}

	if (bookcase && typeof bookcase !== 'string') {
		return c.json({ error: 'bookcaseは文字列である必要があります' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	const bookmeterUrl = getBookmeterUrlFromUserId(user_id);
	const user = await getUserFromBookmeterUrl(bookmeterUrl, bookcase || null);
	const exists = await userExists(sql, user.id);

	// Skip importing data if the user already exists
	if (exists) {
		return c.json({
			user,
			message: 'ユーザーは既に存在します。データインポートをスキップします。',
		});
	}

	try {
		const result = await fullImportUser(sql, user);
		await syncBookMerges(sql);
		await refreshYearlyLeaderboard(sql);
		await deleteOrphanReviews(sql);
		await updateSyncStatusByUserIds(sql, [user.id], 'success');
		return c.json({
			...result,
			message: 'ユーザーが正常に参加し、データがインポートされました',
		});
	} catch (e) {
		await updateSyncStatusByUserIds(sql, [user.id], 'failed');
		return c.json({ message: e.message }, 500);
	}
});

app.get('/:userId/common_reads', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || isNaN(Number(userId))) {
		return c.json({ error: '無効なユーザーIDです' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	const reads = await selectCommonReadsOfUser(sql, Number(userId));
	const userBooks: Record<string, number[]> = {};
	const bookUsers: Record<string, number[]> = {};
	for (const read of reads) {
		if (!userBooks[read.user_id]) userBooks[read.user_id] = [];
		if (!bookUsers[read.book_id]) bookUsers[read.book_id] = [];
		userBooks[read.user_id].push(read.book_id);
		bookUsers[read.book_id].push(read.user_id);
	}

	const relatedUsers = await selectUserByIds(sql, Object.keys(userBooks).map(Number));
	const relatedUsersMap = Object.fromEntries(
		relatedUsers.map((user) => [
			user.id,
			{
				...user,
				book_ids: userBooks[user.id],
			},
		])
	);

	const book_ids = Object.keys(bookUsers).map(Number);
	const bookReviews = await selectReviewsByIds(sql, book_ids);

	const bookReviewsMap: Record<string, BookReview[]> = {};
	bookReviews.forEach((review) => {
		if (!bookReviewsMap[review.book_id]) {
			bookReviewsMap[review.book_id] = [];
		}
		bookReviewsMap[review.book_id].push(review);
	});

	const relatedBooks = await selectBookByIds(sql, Object.keys(bookUsers).map(Number));
	const relatedBooksMap = Object.fromEntries(
		relatedBooks.map((book) => [
			book.id,
			{ ...book, user_ids: bookUsers[book.id], reviews: bookReviewsMap[book.id] || [] },
		])
	);

	for (const bookId of Object.keys(relatedBooksMap)) {
		relatedBooksMap[bookId].user_ids.sort((a, b) => {
			const userA = relatedUsersMap[a];
			const userB = relatedUsersMap[b];
			if (!userA || !userB) return 0;
			return Number(userB.books_read) - Number(userA.books_read);
		});
	}
	for (const userId of Object.keys(relatedUsersMap)) {
		relatedUsersMap[userId].book_ids.sort((a, b) => b - a);
	}

	return c.json({
		books: relatedBooksMap,
		users: relatedUsersMap,
	});
});

app.get('/:userId/summary/:year', async (c) => {
	const userId = Number(c.req.param('userId'));
	const year = Number(c.req.param('year'));
	if (!userId || isNaN(userId)) {
		return c.json({ error: '無効なユーザーIDです' }, 400);
	}
	if (!year || isNaN(year)) {
		return c.json({ error: '無効な年です' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);

	const [startDate, endDate] = getYearPeriod(year);

	const [user, peak_month, best_friend] = await Promise.all([
		getRankedUserInPeriod(sql, userId, startDate, endDate),
		getPeakMonthBooksOfUser(sql, userId, year),
		getBestFriendReads(sql, userId, startDate, endDate),
	]);

	return c.json({
		user,
		peak_month,
		best_friend,
	});
});

app.get('/:userId/lonely_books', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || isNaN(Number(userId))) {
		return c.json({ error: '無効なユーザーIDです' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	const books = await selectLonelyBooksOfUser(sql, Number(userId));
	const book_ids = books.map((b) => b.id);
	const bookReviews = await selectReviewsByIds(sql, book_ids);
	const bookReviewsMap: Record<string, BookReview[]> = {};
	bookReviews.forEach((review) => {
		if (!bookReviewsMap[review.book_id]) {
			bookReviewsMap[review.book_id] = [];
		}
		bookReviewsMap[review.book_id].push(review);
	});

	const booksWithReviews = books.map((b) => ({
		...b,
		reviews: bookReviewsMap[b.id] || [],
	}));

	return c.json({
		books: booksWithReviews,
	});
});

export default app;
