import { Hono } from 'hono';
import { importUser } from '../core/user';
import { createDbClientFromContext } from '../db';
import { selectBookByIds } from '../db/books';
import { selectGroupByIdAndPassword } from '../db/groups';
import { selectCommonReadsOfUser } from '../db/reads';
import {
	selectAllUsers,
	selectUserById,
	selectUserByIds,
	updateSyncStatusByUserIds,
	userExists,
} from '../db/users';
import { getBookmeterUrlFromUserId, getUserFromBookmeterUrl } from '../scraping/user';

const app = new Hono();

app.get('/leaderboard', async (c) => {
	const sql = createDbClientFromContext(c);
	const users = await selectAllUsers(sql);
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
	const { user_id, group_id, password } = await c.req.json();
	if (!user_id || typeof user_id !== 'number') {
		return c.json({ error: 'user_id is required and must be a number' }, 400);
	}
	if (!group_id || typeof group_id !== 'number') {
		return c.json({ error: 'group_id is required and must be a number' }, 400);
	}
	if (!password || typeof password !== 'string') {
		return c.json({ error: 'password is required' }, 400);
	}

	const sql = createDbClientFromContext(c);
	const group = await selectGroupByIdAndPassword(sql, group_id, password);
	if (group === null) {
		return c.json({ error: 'Invalid group ID or password' }, 400);
	}

	const bookmeterUrl = getBookmeterUrlFromUserId(user_id);
	const user = await getUserFromBookmeterUrl(bookmeterUrl);
	const exists = await userExists(sql, user.id);

	// Skip importing data if the user already exists
	if (exists) {
		return c.json({
			user,
			message: 'User already exists, skipping data import.',
		});
	}

	try {
		const result = await importUser(sql, user);
		await updateSyncStatusByUserIds(sql, [user.id], 'success');
		return c.json({
			...result,
			message: 'User joined successfully and data imported',
		});
	} catch (e) {
		await updateSyncStatusByUserIds(sql, [user.id], 'failed');
		return c.json({ message: 'Failed to import user data' }, 500);
	}
});

app.get('/:userId/common_reads', async (c) => {
	const userId = c.req.param('userId');
	if (!userId || isNaN(Number(userId))) {
		return c.json({ error: 'Invalid user id' }, 400);
	}
	const sql = createDbClientFromContext(c);
	const reads = await selectCommonReadsOfUser(sql, Number(userId));
	const userIds = new Set<number>();
	const bookIds = new Set<number>();
	for (const read of reads) {
		userIds.add(read.user_id);
		bookIds.add(read.book_id);
	}
	const relatedUsers = await selectUserByIds(sql, Array.from(userIds));
	const relatedUsersMap = Object.fromEntries(relatedUsers.map((user) => [user.id, user]));
	const relatedBooks = await selectBookByIds(sql, Array.from(bookIds));
	const relatedBooksMap = Object.fromEntries(relatedBooks.map((book) => [book.id, book]));

	// convert to key-value pairs for easier access
	return c.json({
		reads,
		books: relatedBooksMap,
		users: relatedUsersMap,
	});
});

export default app;
