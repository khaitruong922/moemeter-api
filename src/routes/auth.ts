import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { createDbClientFromEnv } from '../db';
import { selectGroupByIdAndPassword } from '../db/groups';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.post('/login', async (c) => {
	const { group_id, password } = await c.req.json();

	if (!group_id || typeof group_id !== 'number') {
		return c.json({ error: 'group_idは必須で、数値である必要があります' }, 400);
	}
	if (!password || typeof password !== 'string') {
		return c.json({ error: 'passwordは必須で、文字列である必要があります' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
	const group = await selectGroupByIdAndPassword(sql, group_id, password);
	if (group === null) {
		return c.json({ error: '無効な認証情報です' }, 401);
	}

	const token = await sign({ group_id: group.id, group_name: group.name }, c.env.JWT_SECRET);
	return c.json({ token });
});

export default app;
