import { Hono } from 'hono';
import { createDbClientFromContext } from '../db';
import { selectBooks } from '../db/books';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';
import { getPageInfo } from '../utils/paging-utils';

const app = new Hono();

app.get('/', async (c) => {
	const perPage = applyNaNVL(parseNatNum(c.req.query('per_page')), 50);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const q = c.req.query('q');
	const field = c.req.query('field');

	// Validate field parameter
	if (field && !['title', 'author'].includes(field)) {
		return c.json({ error: "Field parameter must be either 'title' or 'author'" }, 400);
	}

	const searchQuery = q && typeof q === 'string' ? q.trim().replace(/\s+/g, ' ') : undefined;

	const sql = createDbClientFromContext(c);
	const offset = (reqPage - 1) * perPage;
	const { books, users, total_count } = await selectBooks(sql, offset, perPage, searchQuery, field);
	const pageInfo = getPageInfo(reqPage, perPage, total_count);

	return c.json({
		books,
		users,
		count: books.length,
		total_count,
		pageInfo,
	});
});

export default app;
