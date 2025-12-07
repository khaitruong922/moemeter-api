import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { getFinalBookMerges } from '../db/book_merges';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const bookMerges = await getFinalBookMerges(sql);
	return c.json(bookMerges);
});

export default app;
