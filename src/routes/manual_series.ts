import { Context, Hono } from 'hono';
import {
	addManualSeriesBook,
	createManualSeries,
	deleteManualSeries,
	deleteManualSeriesBook,
	deleteSeriesBookExclusion,
	excludeSeriesBook,
	ManualSeriesError,
	renameManualSeries,
	selectManualSeriesLedger,
	selectSeriesBookExclusions,
} from '../db/manual_series';
import { refreshSeriesLeaderboard } from '../db/series';
import { refreshAll } from '../db/users';
import { validateToken } from '../middlewares/auth';
import { withDb } from '../middlewares/db';
import { AppEnv } from '../types/app_env';
import { Variables } from '../types/variables';

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();
app.use('*', withDb);

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

const handleError = (c: Context, e: unknown) => {
	if (e instanceof ManualSeriesError) {
		return c.json({ error: e.message, detail: e.detail }, e.status);
	}
	throw e;
};

app.get('/', async (c) => {
	const sql = c.get('db');
	const rows = await selectManualSeriesLedger(sql);
	return c.json({ books: rows, count: rows.length });
});

// { name, book_ids } -> new manual series, books at positions 1..n in the given order
app.post('/', validateToken, async (c) => {
	const { name, book_ids } = await c.req.json();
	if (typeof name !== 'string' || name.trim() === '') {
		return c.json({ error: 'nameは必須です' }, 400);
	}
	if (!Array.isArray(book_ids) || book_ids.length === 0 || !book_ids.every(isId)) {
		return c.json({ error: 'book_idsは1件以上の数値の配列である必要があります' }, 400);
	}

	const sql = c.get('db');
	try {
		const result = await createManualSeries(sql, name.trim(), book_ids);
		await refreshAll(sql);
		return c.json(result, 201);
	} catch (e) {
		return handleError(c, e);
	}
});

// { book_id, series_id, after_book_id? | position? } -> add a book to any series. after_book_id
// places it halfway to the next book (8 and 9 -> 8.5); null places it first; position sets an
// exact number (7.1); neither appends at the end.
app.post('/books', validateToken, async (c) => {
	const body = await c.req.json();
	const { book_id, series_id } = body;
	const hasAnchor = 'after_book_id' in body;
	const after_book_id = body.after_book_id;
	const position = body.position;
	if (!isId(book_id) || !isId(series_id)) {
		return c.json({ error: 'book_idとseries_idは必須で、数値である必要があります' }, 400);
	}
	if (hasAnchor && after_book_id !== null && !isId(after_book_id)) {
		return c.json({ error: 'after_book_idは数値またはnullである必要があります' }, 400);
	}
	if (position !== undefined) {
		// numeric(8,2): positive, at most two decimals
		if (
			typeof position !== 'number' ||
			!(position > 0) ||
			position >= 1e6 ||
			// tolerance, not equality: 0.29 * 100 is 28.999999999999996 in floating point
			Math.abs(position * 100 - Math.round(position * 100)) > 1e-6
		) {
			return c.json({ error: 'positionは小数点以下2桁までの正の数である必要があります' }, 400);
		}
		if (hasAnchor) {
			return c.json({ error: 'after_book_idとpositionは同時に指定できません' }, 400);
		}
	}

	const sql = c.get('db');
	try {
		const result = await addManualSeriesBook(
			sql,
			book_id,
			series_id,
			hasAnchor ? after_book_id : undefined,
			position
		);
		await refreshAll(sql);
		return c.json(result, 201);
	} catch (e) {
		return handleError(c, e);
	}
});

app.post('/books/delete', validateToken, async (c) => {
	const { book_id } = await c.req.json();
	if (!isId(book_id)) {
		return c.json({ error: '無効なbook_idです' }, 400);
	}

	const sql = c.get('db');
	try {
		const deleted = await deleteManualSeriesBook(sql, book_id);
		if (!deleted) return c.json({ error: '手動のシリーズ登録がありません' }, 404);
		await refreshAll(sql);
		return c.json({ message: '手動のシリーズ登録を削除しました' });
	} catch (e) {
		return handleError(c, e);
	}
});

app.post('/delete', validateToken, async (c) => {
	const { series_id } = await c.req.json();
	if (!isId(series_id)) {
		return c.json({ error: '無効なseries_idです' }, 400);
	}

	const sql = c.get('db');
	try {
		await deleteManualSeries(sql, series_id);
		await refreshAll(sql);
		return c.json({ message: '手動シリーズを削除しました' });
	} catch (e) {
		return handleError(c, e);
	}
});

app.post('/rename', validateToken, async (c) => {
	const { series_id, name } = await c.req.json();
	if (!isId(series_id)) {
		return c.json({ error: '無効なseries_idです' }, 400);
	}
	if (typeof name !== 'string' || name.trim() === '') {
		return c.json({ error: 'nameは必須です' }, 400);
	}

	const sql = c.get('db');
	try {
		const result = await renameManualSeries(sql, series_id, name.trim());
		// The name is denormalized into series_leaderboard; nothing else needs refreshing
		await refreshSeriesLeaderboard(sql);
		return c.json(result);
	} catch (e) {
		return handleError(c, e);
	}
});

// Per-series blacklist: "this Bookmeter volume does not belong to this series"
app.get('/exclusions', async (c) => {
	const sql = c.get('db');
	const rows = await selectSeriesBookExclusions(sql);
	return c.json({ exclusions: rows, count: rows.length });
});

app.post('/exclusions', validateToken, async (c) => {
	const { book_id, series_id } = await c.req.json();
	if (!isId(book_id) || !isId(series_id)) {
		return c.json({ error: 'book_idとseries_idは必須で、数値である必要があります' }, 400);
	}

	const sql = c.get('db');
	try {
		const result = await excludeSeriesBook(sql, book_id, series_id);
		await refreshAll(sql);
		return c.json(result, 201);
	} catch (e) {
		return handleError(c, e);
	}
});

app.post('/exclusions/delete', validateToken, async (c) => {
	const { book_id, series_id } = await c.req.json();
	if (!isId(book_id) || !isId(series_id)) {
		return c.json({ error: 'book_idとseries_idは必須で、数値である必要があります' }, 400);
	}

	const sql = c.get('db');
	try {
		const deleted = await deleteSeriesBookExclusion(sql, book_id, series_id);
		if (!deleted) return c.json({ error: '除外が登録されていません' }, 404);
		await refreshAll(sql);
		return c.json({ message: '除外を削除しました' });
	} catch (e) {
		return handleError(c, e);
	}
});

export default app;
