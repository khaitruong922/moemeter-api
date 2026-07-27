import { createMiddleware } from 'hono/factory';
import { createDbClientFromEnv } from '../db';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';

export const withDb = createMiddleware<{ Bindings: AppEnv; Variables: Variables }>(
	async (c, next) => {
		const sql = createDbClientFromEnv(c.env);
		c.set('db', sql);
		await next();
	}
);
