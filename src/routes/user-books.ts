import { Hono } from 'hono'
import { getJsonBooks } from "../app";
import { DEFAULT_LIMITS, isBoolQueryOn } from '../utils/bookmeter-utils';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';

const app = new Hono();

app.get('/users/:id/books/read', async (c) => {
	const id = c.req.param('id');
  const perPage = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_LIMITS.BOOKS_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const isAsc = isBoolQueryOn(c.req.query('order'));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/read`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/books/reading', async (c) => {
	const id = c.req.param('id');
  const perPage = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_LIMITS.BOOKS_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const isAsc = isBoolQueryOn(c.req.query('order'));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/reading`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/books/stacked', async (c) => {
	const id = c.req.param('id');
  const perPage = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_LIMITS.BOOKS_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const isAsc = isBoolQueryOn(c.req.query('order'));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/stacked`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/books/wish', async (c) => {
	const id = c.req.param('id');
  const perPage = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_LIMITS.BOOKS_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const isAsc = isBoolQueryOn(c.req.query('order'));
	const jsonBooks = await getJsonBooks(`https://bookmeter.com/users/${id}/books/wish`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

export default app;