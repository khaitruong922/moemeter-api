import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { prettyJSON } from 'hono/pretty-json';
import { createDbClient } from './db';
import { createErrorMessage } from './error';
import books from './routes/books';
import reads from './routes/reads';
import users from './routes/users';
import groups from './routes/groups';

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
		const db = createDbClient(c);
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

export default app;
