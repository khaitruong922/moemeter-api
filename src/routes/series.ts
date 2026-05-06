import { Hono } from 'hono';
import { createDbClientFromEnv } from '../db';
import { selectBooksForSeriesPage, selectSeriesById } from '../db/series';
import { AppEnv } from '../types/app_env';

const app = new Hono<{ Bindings: AppEnv }>();

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

	const { books, users, total_count, read_count, total_reads_count } =
		await selectBooksForSeriesPage(sql, seriesId);

	return c.json({ series, books, users, total_count, read_count, total_reads_count });
});

export default app;
