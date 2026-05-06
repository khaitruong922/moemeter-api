import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { insertSeriesMerge, selectBooksForSeriesPage, selectSeriesById, selectSeriesLeaderboard, selectSeriesStats, type SeriesLeaderboardOrder } from '../db/series';
import { validateToken } from '../middlewares/auth';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

app.get('/leaderboard', async (c) => {
	const orderParam = c.req.query('order');
	const order: SeriesLeaderboardOrder =
		orderParam === 'read_count' ? 'read_count' :
		orderParam === 'book_count' ? 'book_count' :
		orderParam === 'pages' ? 'pages' :
		'reads';
	const sql = createDbClientFromEnv(c.env);
	const series = await selectSeriesLeaderboard(sql, order);
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

	const { total_book_count = books.length, read_count = 0, total_reads_count = 0, total_pages = 0 } = stats ?? {};

	return c.json({ series, books, users, total_book_count, read_count, total_reads_count, total_pages });
});

app.post('/merges', validateToken, async (c) => {
	const body = await c.req.json<{ variant_id: number; base_id: number }>();
	const { variant_id, base_id } = body;
	if (!variant_id || !base_id || isNaN(variant_id) || isNaN(base_id)) {
		return c.json({ error: '無効なIDです' }, 400);
	}
	const sql = createDbClientFromEnv(c.env);
	await insertSeriesMerge(sql, variant_id, base_id);
	return c.json({ ok: true });
});

export default app;
