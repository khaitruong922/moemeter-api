import { Hono } from 'hono';
import { selectMetadata } from '../db/metadata';
import { selectFailedAndTotalUsers } from '../db/users';
import { withDb } from '../middlewares/db';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();
app.use('*', withDb);

app.get('/', async (c) => {
	const sql = c.get('db');
	const metadata = await selectMetadata(sql);
	const { failed_users, total_users } = await selectFailedAndTotalUsers(sql);
	return c.json({
		...metadata,
		failed_users,
		total_users,
	});
});

export default app;
