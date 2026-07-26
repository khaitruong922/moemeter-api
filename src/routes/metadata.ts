import { Hono } from 'hono';
import { selectMetadata } from '../db/metadata';
import { selectFailedAndTotalUsers } from '../db/users';
import { createDbClientFromEnv } from '../db';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const metadata = await selectMetadata(sql);
	const { failed_users, total_users } = await selectFailedAndTotalUsers(sql);
	return c.json({
		...metadata,
		failed_users,
		total_users,
	});
});

export default app;
