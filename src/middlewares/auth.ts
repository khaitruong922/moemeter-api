import { createMiddleware } from 'hono/factory';
import { createDbClientFromEnv } from '../db';
import { selectGroupByIdAndPassword } from '../db/groups';
import { Context } from 'hono';

const unauthorizedError = (c: Context) => {
	return c.json({ error: '無効な認証情報です' }, 401);
};

export const validateGroupAuth = createMiddleware(async (c, next) => {
	const body = await c.req.json();
	const { group_id, password } = body;

	if (!group_id || typeof group_id !== 'number') {
		return unauthorizedError(c);
	}
	if (!password || typeof password !== 'string') {
		return unauthorizedError(c);
	}

	const sql = createDbClientFromEnv(c.env);
	const group = await selectGroupByIdAndPassword(sql, group_id, password);
	if (group === null) {
		return unauthorizedError(c);
	}

	// Store the parsed body and verified group so the route handler can access them
	// c.set('requestBody', body);
	// c.set('group', group);
	return await next();
});
