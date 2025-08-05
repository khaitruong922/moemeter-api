import { Hono } from 'hono';
import { selectBooks } from '../db/books';
import { AppEnv } from '../types/app_env';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';
import { getPageInfo } from '../utils/paging-utils';
import { createDbClientFromEnv } from '../db';
import { selectUserByIds } from '../db/users';
import { selectReadsByBookId } from '../db/reads';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/', async (c) => {
	const perPage = applyNaNVL(parseNatNum(c.req.query('per_page')), 25);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const q = c.req.query('q');
	const field = c.req.query('field');
	const period = c.req.query('period');

	// Validate field parameter
	if (field && !['title', 'author'].includes(field)) {
		return c.json({ error: "Field parameter must be either 'title' or 'author'" }, 400);
	}

	// Validate period parameter
	if (period && !['this_month', 'last_month'].includes(period)) {
		return c.json({ error: "Period parameter must be either 'this_month' or 'last_month'" }, 400);
	}

	const searchQuery = q && typeof q === 'string' ? q.trim().replace(/\s+/g, ' ') : undefined;

	const sql = createDbClientFromEnv(c.env);
	const offset = (reqPage - 1) * perPage;
	const { books, users, total_count } = await selectBooks(
		sql,
		offset,
		perPage,
		searchQuery,
		field,
		period
	);
	const pageInfo = getPageInfo(reqPage, perPage, total_count);

	return c.json({
		books,
		users,
		count: books.length,
		total_count,
		pageInfo,
	});
});

app.get('/:bookId/reads', async (c) => {
	const bookId = c.req.param('bookId');
	if (!bookId || isNaN(Number(bookId))) {
		return c.json({ error: 'Invalid book id' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	const reads = await selectReadsByBookId(sql, Number(bookId));
	const userIds = reads.map((read) => read.user_id);
	const users = await selectUserByIds(sql, userIds);
	const userMap = Object.fromEntries(users.map((user) => [user.id, user]));
	return c.json({
		reads,
		users: userMap,
	});
});

export default app;
