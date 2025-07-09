import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { selectGroupByIdAndPassword } from '../db/groups';
import { syncAllUsers } from '../jobs';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.post('/sync_failed_users', async (c) => {
	const { group_id, password, limit } = await c.req.json();
	if (!group_id || typeof group_id !== 'number') {
		return c.json({ error: 'group_id is required and must be a number' }, 400);
	}
	if (!password || typeof password !== 'string') {
		return c.json({ error: 'password is required' }, 400);
	}
	if (limit && typeof limit !== 'number') {
		return c.json({ error: 'limit must be a number' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	const group = await selectGroupByIdAndPassword(sql, group_id, password);
	if (group === null) {
		return c.json({ error: 'Invalid group ID or password' }, 400);
	}
	const users = await syncAllUsers(sql, 'failed', limit);
	return c.json({
		users,
	});
});

export default app;
