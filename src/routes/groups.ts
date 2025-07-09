import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { selectAllGroups } from '../db/groups';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const groups = await selectAllGroups(sql);
	return c.json(groups);
});

export default app;
