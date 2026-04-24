import { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';

const unauthorizedError = (c: Context) => {
	return c.json({ error: '無効な認証情報です' }, 401);
};

export const validateToken = createMiddleware(async (c, next) => {
	const authHeader = c.req.header('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token) return unauthorizedError(c);

	try {
		await verify(token, c.env.JWT_SECRET);
	} catch {
		return unauthorizedError(c);
	}

	return await next();
});
