import { Hono } from 'hono';
import { parsePerPage, parseReqPage, parseIsAsc, getJsonUserBooks } from '../scraping/user-books';

const app = new Hono();

const buildPaginationParams = (c) => {
	const perPage = parsePerPage(c.req.query('per_page'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	return { perPage, reqPage, isAsc };
};

app.get('/users/:id/books/read', async (c) => {
	const id = c.req.param('id');
	const jsonBooks = await getJsonUserBooks(
		`https://bookmeter.com/users/${id}/books/read`,
		buildPaginationParams(c)
	);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/reading', async (c) => {
	const id = c.req.param('id');
	const jsonBooks = await getJsonUserBooks(
		`https://bookmeter.com/users/${id}/books/reading`,
		buildPaginationParams(c)
	);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/stacked', async (c) => {
	const id = c.req.param('id');
	const jsonBooks = await getJsonUserBooks(
		`https://bookmeter.com/users/${id}/books/stacked`,
		buildPaginationParams(c)
	);
	return c.json(jsonBooks);
});

app.get('/users/:id/books/wish', async (c) => {
	const id = c.req.param('id');
	const jsonBooks = await getJsonUserBooks(
		`https://bookmeter.com/users/${id}/books/wish`,
		buildPaginationParams(c)
	);
	return c.json(jsonBooks);
});

export default app;
