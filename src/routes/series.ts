import { Hono } from 'hono';
import {
	blacklistSeriesIds,
	refreshSeriesLeaderboard,
	selectBooksForSeriesPage,
	selectDuplicateSeriesCandidates,
	selectSeriesById,
	selectSeriesLeaderboard,
	selectSeriesStats,
	selectSeriesWithMultipleAuthors,
	selectSeriesWithReadGaps,
	selectUserSeriesProgress,
	type SeriesLeaderboardOrder,
} from '../db/series';
import { syncBookSeries } from '../core/series';
import { validateToken } from '../middlewares/auth';
import { withDb } from '../middlewares/db';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';
import { refreshAll } from '../db/users';

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();
app.use('*', withDb);

app.get('/leaderboard', async (c) => {
	const orderParam = c.req.query('order');
	const order: SeriesLeaderboardOrder =
		orderParam === 'read_count'
			? 'read_count'
			: orderParam === 'book_count'
				? 'book_count'
				: orderParam === 'pages'
					? 'pages'
					: orderParam === 'completed'
						? 'completed'
						: 'reads';
	const sql = c.get('db');
	const series = await selectSeriesLeaderboard(sql, order);
	return c.json(series);
});

app.get('/multi-author', async (c) => {
	const sql = c.get('db');
	const series = await selectSeriesWithMultipleAuthors(sql);
	return c.json(series);
});

app.get('/user/:userId', async (c) => {
	const userId = Number(c.req.param('userId'));
	if (isNaN(userId)) {
		return c.json({ error: '無効なユーザーIDです' }, 400);
	}
	const sql = c.get('db');
	const result = await selectUserSeriesProgress(sql, userId);
	return c.json(result);
});

app.get('/duplicate', async (c) => {
	const thresholdParam = Number(c.req.query('threshold'));
	const threshold =
		!isNaN(thresholdParam) && thresholdParam > 0 && thresholdParam <= 1 ? thresholdParam : 0.85;
	const sql = c.get('db');
	const candidates = await selectDuplicateSeriesCandidates(sql, threshold);
	return c.json({ candidates, count: candidates.length });
});

// Must stay above '/:seriesId', which would otherwise match 'read-gaps' as a series id.
app.get('/read-gaps', async (c) => {
	const sql = c.get('db');
	const series = await selectSeriesWithReadGaps(sql);
	return c.json({
		series,
		count: series.length,
		gap_count: series.reduce((total, s) => total + s.gap_count, 0),
	});
});

app.get('/:seriesId', async (c) => {
	const seriesId = Number(c.req.param('seriesId'));
	if (isNaN(seriesId)) {
		return c.json({ error: '無効なシリーズIDです' }, 400);
	}

	const sql = c.get('db');
	const series = await selectSeriesById(sql, seriesId);
	if (!series) {
		return c.json({ error: 'シリーズが見つかりません' }, 404);
	}

	const [{ books, users }, stats] = await Promise.all([
		selectBooksForSeriesPage(sql, seriesId),
		selectSeriesStats(sql, seriesId),
	]);

	const {
		total_book_count = books.length,
		read_count = 0,
		total_reads_count = 0,
		total_pages = 0,
	} = stats ?? {};

	return c.json({
		series,
		books,
		users,
		total_book_count,
		read_count,
		total_reads_count,
		total_pages,
	});
});

app.post('/refetch', validateToken, async (c) => {
	const body = await c.req.json<{ book_ids: number[] }>();
	const bookIds = body?.book_ids;
	if (!Array.isArray(bookIds) || bookIds.some((id) => isNaN(id))) {
		return c.json({ error: '無効なbook_idです' }, 400);
	}
	const sql = c.get('db');
	await syncBookSeries(sql, c.env.BOOKMETER_API, bookIds);
	await refreshSeriesLeaderboard(sql);
	await refreshAll(sql);
	return c.json({ ok: true });
});

app.post('/blacklist', validateToken, async (c) => {
	const body = await c.req.json<{ series_ids: number[] }>();
	const { series_ids } = body;
	if (!Array.isArray(series_ids) || series_ids.some((id) => isNaN(id))) {
		return c.json({ error: '無効なシリーズIDです' }, 400);
	}
	const sql = c.get('db');
	await blacklistSeriesIds(sql, series_ids);
	return c.json({ ok: true, blacklisted: series_ids.length });
});

export default app;
