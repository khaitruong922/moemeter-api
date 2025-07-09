import { Hono } from 'hono';
import { fullImportUser } from '../core/user';
import { createDbClientFromContext } from '../db';
import { syncBookMerges, syncReadsMergedBookId } from '../db/book_merges';
import { selectBookByIds } from '../db/books';
import { selectGroupByIdAndPassword } from '../db/groups';
import { selectCommonReadsOfUser } from '../db/reads';
import {
	selectAllUsersWithRank,
	selectUserById,
	selectUserByIds,
	updateSyncStatusByUserIds,
	userExists,
} from '../db/users';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../scraping/user';

const app = new Hono();

app.get('/leaderboard', async (c) => {
	const sql = createDbClientFromContext(c);
	const users = await selectAllUsersWithRank(sql);
	return c.json(users);
});

app.get('/:userId', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || isNaN(Number(userId))) {
		return c.json({ error: 'Invalid user id' }, 400);
	}
	const sql = createDbClientFromContext(c);
	const user = await selectUserById(sql, Number(userId));
	if (user === null) {
		return c.json({ error: 'User not found' }, 404);
	}
	return c.json(user);
});

app.post('/join', async (c) => {
	const { user_id, group_id, password, bookcase } = await c.req.json();
	if (!user_id || typeof user_id !== 'number') {
		return c.json({ error: 'user_id is required and must be a number' }, 400);
	}
	if (!group_id || typeof group_id !== 'number') {
		return c.json({ error: 'group_id is required and must be a number' }, 400);
	}
	if (!password || typeof password !== 'string') {
		return c.json({ error: 'password is required' }, 400);
	}
	if (bookcase && typeof bookcase !== 'string') {
		return c.json({ error: 'bookcase must be a string' }, 400);
	}

	const sql = createDbClientFromContext(c);
	const group = await selectGroupByIdAndPassword(sql, group_id, password);
	if (group === null) {
		return c.json({ error: 'Invalid group ID or password' }, 400);
	}

	const bookmeterUrl = getBookmeterUrlFromUserId(user_id);
	const user = await getUserFromBookmeterUrl(bookmeterUrl, bookcase || null);
	const exists = await userExists(sql, user.id);

	// Skip importing data if the user already exists
	if (exists) {
		return c.json({
			user,
			message: 'User already exists, skipping data import.',
		});
	}

	try {
		const result = await fullImportUser(sql, user);
		await syncBookMerges(sql);
		await syncReadsMergedBookId(sql);
		await updateSyncStatusByUserIds(sql, [user.id], 'success');
		return c.json({
			...result,
			message: 'User joined successfully and data imported',
		});
	} catch (e) {
		await updateSyncStatusByUserIds(sql, [user.id], 'failed');
		return c.json({ message: e.message }, 500);
	}
});

app.get('/:userId/common_reads', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || isNaN(Number(userId))) {
		return c.json({ error: 'Invalid user id' }, 400);
	}
	const sql = createDbClientFromContext(c);
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

	const relatedBooks = await selectBookByIds(sql, Object.keys(bookUsers).map(Number));
	const relatedBooksMap = Object.fromEntries(
		relatedBooks.map((book) => [book.id, { ...book, user_ids: bookUsers[book.id] }])
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

export default app;
