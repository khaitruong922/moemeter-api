import { Hono } from 'hono';
import { getFinalBookMerges, selectBookMergeChains } from '../db/book_merges';
import { withDb } from '../middlewares/db';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();
app.use('*', withDb);

app.get('/', async (c) => {
	const sql = c.get('db');
	const bookMerges = await getFinalBookMerges(sql);
	return c.json(bookMerges);
});

app.get('/chains', async (c) => {
	const sql = c.get('db');
	const chains = await selectBookMergeChains(sql);
	return c.json({ chains, count: chains.length });
});

export default app;
