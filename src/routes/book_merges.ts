import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { getFinalBookMerges, selectBookMergeChains } from '../db/book_merges';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const bookMerges = await getFinalBookMerges(sql);
	return c.json(bookMerges);
});

app.get('/chains', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const chains = await selectBookMergeChains(sql);
	return c.json({ chains, count: chains.length });
});

export default app;
