import { Hono } from 'hono';
import { createDbClientFromContext } from '../db';
import { selectAllBooks } from '../db/books';
import { DEFAULT_LIMITS } from '../utils/bookmeter-utils';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';
import { getPageInfo } from '../utils/paging-utils';

const app = new Hono();

app.get('/', async (c) => {
	const perPage = applyNaNVL(parseNatNum(c.req.query('per_page')), DEFAULT_LIMITS.BOOKS_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);

	const sql = createDbClientFromContext(c);
	const offset = (reqPage - 1) * perPage;
	const { books, totalCount } = await selectAllBooks(sql, offset, perPage);
	const pageInfo = getPageInfo(reqPage, perPage, totalCount);

	return c.json({
		books,
		count: books.length,
		totalCount,
		pageInfo,
	});
});

export default app;
