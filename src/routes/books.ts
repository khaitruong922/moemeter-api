import { Hono } from 'hono';
import { createDbClientFromContext } from '../db';
import { DEFAULT_LIMITS } from '../utils/bookmeter-utils';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';
import { getPageInfo } from '../utils/paging-utils';
import { selectBooks } from '../db/books';

const app = new Hono();

app.get('/', async (c) => {
	const perPage = applyNaNVL(parseNatNum(c.req.query('per_page')), DEFAULT_LIMITS.BOOKS_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const q = c.req.query('q');
	const searchQuery = q && typeof q === 'string' ? q.trim() : undefined;

	const sql = createDbClientFromContext(c);
	const offset = (reqPage - 1) * perPage;
	const { books, users, total_count } = await selectBooks(sql, offset, perPage, searchQuery);
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
