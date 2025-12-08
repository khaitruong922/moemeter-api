import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { addBookMergeException, deleteBookMergeException } from '../db/book_merges';
import { validateGroupAuth } from '../middlewares/auth';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.post('/', validateGroupAuth, async (c) => {
	const { variant_id } = await c.req.json();

	if (!variant_id || typeof variant_id !== 'number') {
		return c.json({ error: 'variant_idは必須で、数値である必要があります' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	await addBookMergeException(sql, variant_id);
	return c.json({ message: '本マージ例外が正常に追加されました' }, 201);
});

app.post('/delete', validateGroupAuth, async (c) => {
	const { variant_id } = await c.req.json();
	if (!variant_id || typeof variant_id !== 'number') {
		return c.json({ error: '無効なvariant_idです' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	await deleteBookMergeException(sql, Number(variant_id));
	return c.json({ message: '本マージ例外が正常に削除されました' });
});

export default app;
