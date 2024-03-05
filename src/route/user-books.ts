import { Hono } from 'hono'
import { getJsonBooks, getBooksValidatedLimit } from "../app";
import { parseNatNum } from '../util';

const app = new Hono();

app.get('/users/:id/books/read', async (c) => {
	const id = c.req.param('id');
  const limit = getBooksValidatedLimit(parseNatNum(c.req.query('limit')));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/read`, limit);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/reading', async (c) => {
	const id = c.req.param('id');
  const limit = getBooksValidatedLimit(parseNatNum(c.req.query('limit')));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/reading`, limit);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/stacked', async (c) => {
	const id = c.req.param('id');
  const limit = getBooksValidatedLimit(parseNatNum(c.req.query('limit')));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/stacked`, limit);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/wish', async (c) => {
	const id = c.req.param('id');
  const limit = getBooksValidatedLimit(parseNatNum(c.req.query('limit')));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/wish`, limit);
	return c.json(jsonBooks);
});

export default app;