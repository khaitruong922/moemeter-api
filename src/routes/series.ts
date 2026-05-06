import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import {
	blacklistSeriesIds,
	insertSeriesMerge,
	refreshSeriesLeaderboard,
	selectBooksForSeriesPage,
	selectSeriesById,
	selectSeriesLeaderboard,
	selectSeriesStats,
	selectSeriesWithMultipleAuthors,
	type SeriesLeaderboardOrder,
} from '../db/series';
import { syncBookSeries } from '../core/series';
import { validateToken } from '../middlewares/auth';
import { AppEnv } from '../types/app_env';
import { refreshAll } from '../db/users';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/leaderboard', async (c) => {
	const orderParam = c.req.query('order');
	const order: SeriesLeaderboardOrder =
		orderParam === 'read_count'
			? 'read_count'
			: orderParam === 'book_count'
				? 'book_count'
				: orderParam === 'pages'
					? 'pages'
					: 'reads';
	const sql = createDbClientFromEnv(c.env);
	const series = await selectSeriesLeaderboard(sql, order);
	return c.json(series);
});

app.get('/multi-author', async (c) => {
	const sql = createDbClientFromEnv(c.env);
	const series = await selectSeriesWithMultipleAuthors(sql);
	return c.json(series);
});

app.get('/:seriesId', async (c) => {
	const seriesId = Number(c.req.param('seriesId'));
	if (isNaN(seriesId)) {
		return c.json({ error: '無効なシリーズIDです' }, 400);
	}

	const sql = createDbClientFromEnv(c.env);
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
	const body = await c.req.json<{ book_id: number }>();
	const bookId = Number(body?.book_id);
	if (!bookId || isNaN(bookId)) {
		return c.json({ error: '無効なbook_idです' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	await syncBookSeries(sql, c.env.BOOKMETER_API, [bookId]);
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
	const sql = createDbClientFromEnv(c.env);
	await blacklistSeriesIds(sql, series_ids);
	return c.json({ ok: true, blacklisted: series_ids.length });
});

app.post('/merges', validateToken, async (c) => {
	const body = await c.req.json<{ variant_id: number; base_id: number }>();
	const { variant_id, base_id } = body;
	if (!variant_id || !base_id || isNaN(variant_id) || isNaN(base_id)) {
		return c.json({ error: '無効なIDです' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	await insertSeriesMerge(sql, variant_id, base_id);
	await refreshAll(sql);
	return c.json({ ok: true });
});

export default app;
