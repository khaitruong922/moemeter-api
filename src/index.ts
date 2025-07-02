import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { createErrorMessage } from './error';
import userBooks from './routes/user-books';
import summary from './routes/summary';
import { createDbClient } from './db/db';

const app = new Hono();
app.use('*', prettyJSON());
app.use('*', cors());

app.get('/', async (c) => {
	const db = createDbClient(c);
	console.log(db);
	try {
		const res = await db`SELECT * from users;`;
		console.log('Database connection successful:', res);
		return c.json({
			message: 'Database connection successful.',
			data: res,
		});
	} catch (error) {
		console.error('Database connection error:', error);
		return c.json(createErrorMessage('Database connection failed'), 500);
	}
});

app.route('/', userBooks);
app.route('/', summary);

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
