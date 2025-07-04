import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { prettyJSON } from 'hono/pretty-json';
import { createDbClientFromContext } from './db';
import { createErrorMessage } from './error';
import { syncAllUsers } from './jobs';
import books from './routes/books';
import groups from './routes/groups';
import metadata from './routes/metadata';
import reads from './routes/reads';
import users from './routes/users';
import { Env } from './types/env';
import { performKeepAliveQuery } from './db/supabase';

const app = new Hono();
app.use('*', prettyJSON());
app.use('*', cors());

app.get('/', async (c) => {
	return c.json({
		message: 'Welcome to Bookmeter API',
	});
});

app.get('/health', async (c) => {
	try {
		const db = createDbClientFromContext(c);
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
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		await performKeepAliveQuery(env);
		await syncAllUsers(env).catch((error) => {
			console.error('Failed to sync users:', error);
		});
	},
};
