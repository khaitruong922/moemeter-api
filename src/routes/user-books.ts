import { Hono } from 'hono'
import { getJsonBooks } from "../app";
import { DEFAULT_BOOKS_LIMIT } from '../utils/bookmeter-utils';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';

const app = new Hono();

app.get('/users/:id/books/read', async (c) => {
	const id = c.req.param('id');
  const limit = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_BOOKS_LIMIT);
	const page = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/read`, limit, page);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/reading', async (c) => {
	const id = c.req.param('id');
  const limit = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_BOOKS_LIMIT);
	const page = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/reading`, limit, page);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/stacked', async (c) => {
	const id = c.req.param('id');
  const limit = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_BOOKS_LIMIT);
	const page = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/stacked`, limit, page);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/wish', async (c) => {
	const id = c.req.param('id');
  const limit = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_BOOKS_LIMIT);
	const page = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/wish`, limit, page);
	return c.json(jsonBooks);
});

export default app;