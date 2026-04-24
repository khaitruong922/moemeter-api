import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import {
	addBlacklistedBook,
	removeBlacklistedBook,
	selectBlacklistedBookIds,
} from '../db/blacklisted_books';
import { validateToken } from '../middlewares/auth';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();

app.get('/', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const blacklistedBookIds = await selectBlacklistedBookIds(sql);
	return c.json({ book_ids: Array.from(blacklistedBookIds) });
});

app.post('/', validateToken, async (c) => {
	const { book_id } = await c.req.json();

	if (!book_id || typeof book_id !== 'number') {
		return c.json({ error: 'book_idは必須で、数値である必要があります' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	await addBlacklistedBook(sql, book_id);

	return c.json({
		message: 'ブックリストに追加されました',
		book_id,
	});
});

app.delete('/:bookId', validateToken, async (c) => {
	const bookId = Number(c.req.param('bookId'));
	if (!bookId || isNaN(bookId)) {
		return c.json({ error: '無効なブックIDです' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	await removeBlacklistedBook(sql, bookId);

	return c.json({
		message: 'ブックリストから削除されました',
		book_id: bookId,
	});
});

export default app;
