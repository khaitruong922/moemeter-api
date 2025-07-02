import { Hono } from 'hono';
import {
	parsePerPageMonthly,
	parsePerPageYearly,
	parseReqPage,
	parseIsAsc,
	parseIsShort,
	getJsonSummaryMonthly,
	getJsonSummaryYearly,
} from '../app/summary';

const app = new Hono();

app.get('/users/:id/summary/monthly/:year/:month', async (c) => {
	const id = c.req.param('id');
	const year = c.req.param('year');
	const month = c.req.param('month');
	const perPage = parsePerPageMonthly(c.req.query('per_page'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	const jsonBooks = await getJsonSummaryMonthly(`https://bookmeter.com/users/${id}/summary/monthly/${year}/${month}`, {
		perPage,
		reqPage,
		isAsc,
	});
	return c.json(jsonBooks);
});

app.get('/users/:id/summary/yearly/:year', async (c) => {
	const id = c.req.param('id');
	const year = c.req.param('year');
	const perPage = parsePerPageYearly(c.req.query('per_page'));
	const reqPage = parseReqPage(c.req.query('page'));
	const isAsc = parseIsAsc(c.req.query('order'));
	// 一旦簡易版表示
	// const isShort = parseIsShort(c.req.query('short'));
	const isShort = parseIsShort('1');
	const jsonBooks = await getJsonSummaryYearly(`https://bookmeter.com/users/${id}/summary/yearly/${year}`, {
		perPage,
		reqPage,
		isAsc,
		isShort,
	});
	return c.json(jsonBooks);
});

export default app;
