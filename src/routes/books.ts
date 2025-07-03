import { Hono } from 'hono';
import { createDbClient } from '../db';
import { selectAllBooks } from '../db/books';

const app = new Hono();

app.get('/', async (c) => {
	const sql = createDbClient(c);
	const books = await selectAllBooks(sql);
	return c.json(books);
});

export default app;
