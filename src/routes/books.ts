import { Hono } from 'hono';
import { createDbClientFromContext } from '../db';
import { selectAllBooks } from '../db/books';

const app = new Hono();

app.get('/', async (c) => {
	const sql = createDbClientFromContext(c);
	const books = await selectAllBooks(sql);
	return c.json(books);
});

export default app;
