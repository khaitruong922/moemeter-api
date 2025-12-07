import { createMiddleware } from 'hono/factory';
import { createDbClientFromEnv } from '../db';
import { selectGroupByIdAndPassword } from '../db/groups';

/**
 * Middleware to validate group authentication credentials
 * Checks that group_id and password are present in request body
 * and verifies against the database
 */
export const validateGroupAuth = createMiddleware(async (c, next) => {
	const body = await c.req.json();
	const { group_id, password } = body;

	if (!group_id || typeof group_id !== 'number') {
		return c.json({ error: 'group_idは必須で、数値である必要があります' }, 400);
	}
	if (!password || typeof password !== 'string') {
		return c.json({ error: 'passwordは必須です' }, 400);
	}

	// Verify group credentials against database
	const sql = createDbClientFromEnv(c.env);
	const group = await selectGroupByIdAndPassword(sql, group_id, password);
	if (group === null) {
		return c.json({ error: '無効なグループIDまたはパスワードです' }, 400);
	}

	// Store the parsed body and verified group so the route handler can access them
	c.set('requestBody', body);
	c.set('group', group);
	return await next();
});
