import { Hono } from 'hono'
import { parsePerPage, parseReqPage, parseIsAsc, getJsonUserBooks } from '../app/user-books';

const app = new Hono();

app.get('/users/:id/books/read', async (c) => {
	const id = c.req.param('id');
  const perPage = parsePerPage(c.req.query('limit'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	const jsonBooks = await getJsonUserBooks(`https://bookmeter.com/users/${id}/books/read`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/books/reading', async (c) => {
	const id = c.req.param('id');
  const perPage = parsePerPage(c.req.query('limit'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	const jsonBooks = await getJsonUserBooks(`https://bookmeter.com/users/${id}/books/reading`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/books/stacked', async (c) => {
	const id = c.req.param('id');
  const perPage = parsePerPage(c.req.query('limit'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	const jsonBooks = await getJsonUserBooks(`https://bookmeter.com/users/${id}/books/stacked`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/books/wish', async (c) => {
	const id = c.req.param('id');
  const perPage = parsePerPage(c.req.query('limit'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	const jsonBooks = await getJsonUserBooks(`https://bookmeter.com/users/${id}/books/wish`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

export default app;