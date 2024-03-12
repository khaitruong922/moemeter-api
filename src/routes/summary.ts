import { Hono } from 'hono'
import { getJsonSummaryMonthly, getJsonSummaryYearly } from "../app";
import { DEFAULT_LIMITS, isBoolQueryOn } from '../utils/bookmeter-utils';
import { applyNaNVL, parseNatNum } from '../utils/number-utils';

const app = new Hono();

app.get('/users/:id/summary/monthly/:year/:month', async (c) => {
	const id = c.req.param('id');
	const year = c.req.param('year');
	const month = c.req.param('month');
  const perPage = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_LIMITS.SUMMARY_MONTHLY_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const isAsc = isBoolQueryOn(c.req.query('order'));
	const jsonBooks = await getJsonSummaryMonthly(`https://bookmeter.com/users/${id}/summary/monthly/${year}/${month}`, { perPage, reqPage, isAsc });
	return c.json(jsonBooks);
});

app.get('/users/:id/summary/yearly/:year', async (c) => {
	const id = c.req.param('id');
	const year = c.req.param('year');
  const perPage = applyNaNVL(parseNatNum(c.req.query('limit')), DEFAULT_LIMITS.SUMMARY_YEARLY_LIMIT);
	const reqPage = applyNaNVL(parseNatNum(c.req.query('page')), 1);
	const isAsc = isBoolQueryOn(c.req.query('order'));
	// 一旦簡易版表示
	// const isShort = isBoolQueryOn(c.req.query('short'));
	const isShort = isBoolQueryOn('1');
	const jsonBooks = await getJsonSummaryYearly(`https://bookmeter.com/users/${id}/summary/yearly/${year}`, { perPage, reqPage, isAsc, isShort });
	return c.json(jsonBooks);
});

export default app;