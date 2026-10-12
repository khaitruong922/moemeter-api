import { Context, Hono } from 'hono';
import {
	addManualSeriesBooks,
	AddManualSeriesBookEntry,
	createManualSeriesBatch,
	CreateManualSeriesEntry,
	deleteManualSeries,
	deleteManualSeriesBook,
	deleteSeriesBookExclusion,
	excludeSeriesBook,
	ManualSeriesError,
	renameManualSeries,
	updateManualSeriesPositions,
	selectManualSeriesLedger,
	selectSeriesConflicts,
	selectSeriesBookExclusions,
	selectSeriesScanDecisions,
	SeriesScanDecision,
	upsertSeriesScanDecisions,
	withSeriesSuffix,
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

// numeric(8,2): positive, at most two decimals. A tolerance, not equality: 0.29 * 100 is
// 28.999999999999996 in floating point.
const isPosition = (v: unknown): v is number =>
	typeof v === 'number' && v > 0 && v < 1e6 && Math.abs(v * 100 - Math.round(v * 100)) <= 1e-6;

const MAX_BATCH = 200;

const handleError = (c: Context, e: unknown) => {
	if (e instanceof ManualSeriesError) {
		return c.json({ error: e.message, detail: e.detail }, e.status);
	}
	throw e;
};

// Books where the manual and the Bookmeter membership disagree on the series (see /series-conflict)
app.get('/conflicts', async (c) => {
	const sql = c.get('db');
	const conflicts = await selectSeriesConflicts(sql);
	return c.json({ conflicts, count: conflicts.length });
});

app.get('/', async (c) => {
	const sql = c.get('db');
	const rows = await selectManualSeriesLedger(sql);
	return c.json({ books: rows, count: rows.length });
});

// { name, book_ids } -> new manual series, books at positions 1..n in the given order
// New manual series: an array of { name, book_ids } (books at positions 1..n in order). One
// transaction and one refreshAll for the whole batch; "シリーズ" is appended to names without it.
app.post('/', validateToken, async (c) => {
	const body = await c.req.json();
	if (!Array.isArray(body) || body.length === 0 || body.length > MAX_BATCH) {
		return c.json({ error: `1〜${MAX_BATCH}件の配列を指定してください` }, 400);
	}
	const entries: CreateManualSeriesEntry[] = [];
	for (const [index, item] of body.entries()) {
		const { name, book_ids } = item ?? {};
		if (typeof name !== 'string' || name.trim() === '') {
			return c.json({ error: 'nameは必須です', detail: { index } }, 400);
		}
		if (!Array.isArray(book_ids) || book_ids.length === 0 || !book_ids.every(isId)) {
			return c.json(
				{ error: 'book_idsは1件以上の数値の配列である必要があります', detail: { index } },
				400
			);
		}
		const { positions } = item;
		if (positions !== undefined) {
			const valid =
				Array.isArray(positions) &&
				positions.length === book_ids.length &&
				positions.every(isPosition) &&
				new Set(positions).size === positions.length;
			if (!valid) {
				return c.json(
					{
						error:
							'positionsはbook_idsと同じ件数の、重複しない正の数（小数点以下2桁まで）である必要があります',
						detail: { index },
					},
					400
				);
			}
		}
		entries.push({
			name: withSeriesSuffix(name),
			book_ids,
			...(positions !== undefined ? { positions } : {}),
		});
	}

	const sql = c.get('db');
	try {
		const results = await createManualSeriesBatch(sql, entries);
		await refreshAll(sql);
		return c.json(results, 201);
	} catch (e) {
		return handleError(c, e);
	}
});

// Validates one add-book entry; returns the entry or an error message
const parseAddEntry = (body: unknown): AddManualSeriesBookEntry | string => {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		return '各要素はオブジェクトである必要があります';
	const b = body as Record<string, unknown>;
	if (!isId(b.book_id) || !isId(b.series_id)) {
		return 'book_idとseries_idは必須で、数値である必要があります';
	}
	const position = b.position;
	if (position !== undefined) {
		if (!isPosition(position)) {
			return 'positionは小数点以下2桁までの正の数である必要があります';
		}
	}
	return {
		book_id: b.book_id,
		series_id: b.series_id,
		...(position !== undefined ? { position: position as number } : {}),
	};
};

// Add books to any series. Body is an array of entries, applied in order in one transaction:
// later entries see earlier ones, and any failure rolls back the whole batch with the entry
// index in the error. Each entry: { book_id, series_id, position? } — position is an exact
// number (7.1, 8.5); omitted appends after the last book.
app.post('/books', validateToken, async (c) => {
	const body = await c.req.json();
	if (!Array.isArray(body) || body.length === 0 || body.length > MAX_BATCH) {
		return c.json({ error: `1〜${MAX_BATCH}件の配列を指定してください` }, 400);
	}

	const entries: AddManualSeriesBookEntry[] = [];
	for (const [index, item] of body.entries()) {
		const parsed = parseAddEntry(item);
		if (typeof parsed === 'string') {
			return c.json({ error: parsed, detail: { index } }, 400);
		}
		entries.push(parsed);
	}

	const sql = c.get('db');
	try {
		const results = await addManualSeriesBooks(sql, entries);
		await refreshAll(sql);
		return c.json(results, 201);
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
		const result = await renameManualSeries(sql, series_id, withSeriesSuffix(name));
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

const SCAN_KINDS = ['new_series', 'add_to_series'];

// Series scan review decisions (.claude/skills/series-scan): what was approved or rejected, so the
// next scan does not propose it again
app.get('/scan_decisions', async (c) => {
	const sql = c.get('db');
	const rows = await selectSeriesScanDecisions(sql);
	return c.json({ decisions: rows, count: rows.length });
});

app.post('/scan_decisions', validateToken, async (c) => {
	const body = await c.req.json();
	if (!Array.isArray(body) || body.length === 0 || body.length > 2000) {
		return c.json({ error: '1〜2000件の配列を指定してください' }, 400);
	}
	const decisions: SeriesScanDecision[] = [];
	for (const [index, d] of body.entries()) {
		const valid =
			d &&
			typeof d.fingerprint === 'string' &&
			d.fingerprint.length > 0 &&
			SCAN_KINDS.includes(d.kind) &&
			(d.decision === 'approved' || d.decision === 'rejected') &&
			Array.isArray(d.book_ids) &&
			d.book_ids.length > 0 &&
			d.book_ids.every(isId) &&
			(d.series_id == null || isId(d.series_id)) &&
			(d.confidence == null || typeof d.confidence === 'number');
		if (!valid) return c.json({ error: '無効な判定です', detail: { index } }, 400);
		decisions.push({
			fingerprint: d.fingerprint,
			kind: d.kind,
			decision: d.decision,
			book_ids: d.book_ids,
			series_id: d.series_id ?? null,
			confidence: d.confidence ?? null,
		});
	}
	const sql = c.get('db');
	await upsertSeriesScanDecisions(sql, decisions);
	return c.json({ saved: decisions.length }, 201);
});

// Renumber manual books already in a series: { series_id, books: [{ book_id, position }] }
app.post('/positions', validateToken, async (c) => {
	const { series_id, books } = await c.req.json();
	if (!isId(series_id)) return c.json({ error: '無効なseries_idです' }, 400);
	if (
		!Array.isArray(books) ||
		books.length === 0 ||
		books.length > MAX_BATCH ||
		!books.every((b) => b && isId(b.book_id) && isPosition(b.position))
	) {
		return c.json(
			{
				error: `booksは1〜${MAX_BATCH}件の { book_id, position }（小数点以下2桁まで）である必要があります`,
			},
			400
		);
	}
	const sql = c.get('db');
	try {
		const result = await updateManualSeriesPositions(
			sql,
			series_id,
			books.map((b: { book_id: number; position: number }) => ({
				book_id: b.book_id,
				position: b.position,
			}))
		);
		// positions decide the leaderboard cover; nothing else is denormalized
		await refreshSeriesLeaderboard(sql);
		return c.json({ updated: result });
	} catch (e) {
		return handleError(c, e);
	}
});

export default app;
