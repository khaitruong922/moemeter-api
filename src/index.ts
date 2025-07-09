import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { prettyJSON } from 'hono/pretty-json';
import { createDbClientFromEnv } from './db';
import { performKeepAliveQuery } from './db/supabase';
import { createErrorMessage } from './error';
import { syncAllUsers } from './jobs';
import books from './routes/books';
import groups from './routes/groups';
import job from './routes/job';
import metadata from './routes/metadata';
import reads from './routes/reads';
import users from './routes/users';
import { AppEnv } from './types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();
app.use('*', prettyJSON());
app.use('*', cors());

app.get('/', async (c) => {
	return c.json({
		message: 'Welcome to Bookmeter API',
	});
});

app.get('/health', async (c) => {
	try {
		const db = createDbClientFromEnv(c.env);
		await db`SELECT 1`;
		return c.json({ status: 'ok' });
	} catch (error) {
		console.error('Database connection failed:', error);
		return c.json(createErrorMessage('Database connection failed'), 500);
	}
});

app.route('/users', users);
app.route('/books', books);
app.route('/reads', reads);
app.route('/groups', groups);
app.route('/metadata', metadata);
app.route('/job', job);

app.notFound((c) => {
	return c.json(createErrorMessage('Not Found'), 404);
});

app.onError((e, c) => {
	if (e instanceof HTTPException) {
		console.log(`${e}`);
		return c.json(createErrorMessage(e.message), e.status);
	}
	console.log(`${e}`);
	return c.json(createErrorMessage('Internal Server Error'), 500);
});

export default {
	fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},
	async scheduled(event: ScheduledController, env: AppEnv, ctx: ExecutionContext) {
		const now = new Date(event.scheduledTime);
		const utcHour = now.getUTCHours();
		const utcMinutes = now.getUTCMinutes();
		console.log('Hour: ', utcHour, 'Minutes: ', utcMinutes);
		const sql = createDbClientFromEnv(env);

		if (event.cron === '0 * * * *') {
			if ((utcHour === 0 && utcMinutes === 0) || (utcHour === 12 && utcMinutes === 0)) {
				await performKeepAliveQuery(env);
				await syncAllUsers(sql, {
					syncStatus: null,
					bookCountOrder: 'DESC',
					limit: null,
				}).catch((error) => {
					console.error('Failed to sync all users:', error);
				});
			} else {
				await syncAllUsers(sql, {
					syncStatus: 'failed',
					bookCountOrder: 'DESC',
					limit: null,
				}).catch((error) => {
					console.error('Failed to sync failed users:', error);
				});
			}
		} else if (event.cron === '*/2 * * * *' && utcMinutes !== 0) {
			await syncAllUsers(sql, {
				syncStatus: 'failed',
				bookCountOrder: 'ASC',
				limit: 3,
			}).catch((error) => {
				console.error('Failed to sync failed users:', error);
			});
		}
	},
};
