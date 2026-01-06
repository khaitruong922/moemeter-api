import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { prettyJSON } from 'hono/pretty-json';
import { createDbClientFromEnv } from './db';
import { performKeepAliveQuery } from './db/supabase';
import { createErrorMessage } from './error';
import { syncAllUsers } from './jobs';
import bookMergeExceptions from './routes/book_ merge_exceptions';
import bookMerges from './routes/book_merges';
import books from './routes/books';
import groups from './routes/groups';
import manualBookMerges from './routes/manual_book_merges';
import metadata from './routes/metadata';
import reads from './routes/reads';
import users from './routes/users';
import { AppEnv } from './types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();
app.use('*', prettyJSON());
app.use('*', cors());

app.get('/', async (c) => {
	return c.json({
		message: 'Moemeter APIへようこそ',
	});
});

app.get('/health', async (c) => {
	try {
		const db = createDbClientFromEnv(c.env);
		await db`SELECT 1`;
		return c.json({ status: 'ok' });
	} catch (error) {
		console.error('Database connection failed:', error);
		return c.json(createErrorMessage('データベース接続に失敗しました'), 500);
	}
});

app.route('/users', users);
app.route('/books', books);
app.route('/book_merges', bookMerges);
app.route('/manual_book_merges', manualBookMerges);
app.route('/book_merge_exceptions', bookMergeExceptions);
app.route('/reads', reads);
app.route('/groups', groups);
app.route('/metadata', metadata);

app.notFound((c) => {
	return c.json(createErrorMessage('見つかりません'), 404);
});

app.onError((e, c) => {
	if (e instanceof HTTPException) {
		console.log(`${e}`);
		return c.json(createErrorMessage(e.message), e.status);
	}
	console.log(`${e}`);
	return c.json(createErrorMessage('内部サーバーエラー'), 500);
});

export default {
	fetch(request: Request, env: AppEnv, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},
	async scheduled(event: ScheduledController, env: AppEnv, ctx: ExecutionContext) {
		const now = new Date(event.scheduledTime);
		const utcHour = now.getUTCHours();
		const utcMinutes = now.getUTCMinutes();
		console.log('時刻: ', utcHour, '分: ', utcMinutes);
		const sql = createDbClientFromEnv(env);
		const bookmeterApiService = env.BOOKMETER_API;

		if (event.cron === '0 3,15 * * *') {
			await performKeepAliveQuery(env);
			await syncAllUsers(sql, bookmeterApiService, {
				syncStatus: null,
				bookCountOrder: 'DESC',
				limit: null,
			}).catch((error) => {
				console.error('全ユーザーの同期に失敗しました:', error);
			});
		} else if (event.cron === '*/3 3,15 * * *' && utcMinutes !== 0) {
			await syncAllUsers(sql, bookmeterApiService, {
				syncStatus: 'failed',
				bookCountOrder: 'ASC',
				limit: null,
			}).catch((error) => {
				console.error('失敗したユーザーの同期に失敗しました:', error);
			});
		}
	},
};
