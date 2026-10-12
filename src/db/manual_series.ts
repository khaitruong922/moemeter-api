import postgres from 'postgres';
import { pgIntArray } from '../utils/pg';
import { insertManualSeries } from './series';

// Manual series curation (docs/series/README.md §4). Manual memberships live in series_books with
// source = 'manual' and win over Bookmeter's in the book_series view. Book ids are stored as their
// canonical (merge base) id, so a manual decision survives later merges of its variants.

export class ManualSeriesError extends Error {
	constructor(
		message: string,
		readonly status: 400 | 404 | 409,
		readonly detail?: unknown
	) {
		super(message);
	}
}

type Member = { book_id: number; position: number | null };

// Adds a batch entry's index to a ManualSeriesError's detail; other errors pass through
const withIndex = (e: unknown, index: number): unknown => {
	if (!(e instanceof ManualSeriesError)) return e;
	const detail = e.detail && typeof e.detail === 'object' ? { index, ...e.detail } : { index };
	return new ManualSeriesError(e.message, e.status, detail);
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Canonical ids for the given books, in input order. Throws 404 listing any id not in `books`.
const resolveCanonicalIds = async (sql: postgres.Sql<{}>, bookIds: number[]): Promise<number[]> => {
	const rows = await sql<{ id: number; canonical_id: number }[]>`
    SELECT b.id, COALESCE(fm.base_id, b.id) AS canonical_id
    FROM books b
    LEFT JOIN final_book_merges fm ON fm.variant_id = b.id
    WHERE b.id IN ${sql(bookIds)}
  `;
	const byId = new Map(rows.map((r) => [r.id, r.canonical_id]));
	const missing = bookIds.filter((id) => !byId.has(id));
	if (missing.length > 0) {
		throw new ManualSeriesError('存在しない本が含まれています', 404, { book_ids: missing });
	}
	return bookIds.map((id) => byId.get(id)!);
};

const selectSeriesMembers = async (sql: postgres.Sql<{}>, seriesId: number): Promise<Member[]> =>
	sql<Member[]>`
    SELECT book_id, position::float8 AS position
    FROM book_series
    WHERE series_id = ${seriesId}
    ORDER BY position ASC NULLS LAST, book_id ASC
  `;

// Position for a book appended after the last positioned book (8.5 -> 9)
const appendPosition = (members: Member[]): number => {
	const last = members.filter((m) => m.position !== null).at(-1)?.position ?? 0;
	return Math.floor(last) + 1;
};

export type ManualSeriesBookResult = {
	book_id: number;
	series_id: number;
	position: number;
	// Bookmeter's series for this book, when it differs: the manual row now overrides it
	overrides_series_id: number | null;
};

const selectBookmeterSeries = async (
	sql: postgres.Sql<{}>,
	bookIds: number[]
): Promise<Map<number, number>> => {
	const rows = await sql<{ book_id: number; series_id: number }[]>`
    SELECT COALESCE(fm.base_id, sb.book_id) AS book_id, sb.series_id
    FROM series_books sb
    LEFT JOIN final_book_merges fm ON fm.variant_id = sb.book_id
    WHERE sb.source = 'bookmeter'
      AND COALESCE(fm.base_id, sb.book_id) IN ${sql(bookIds)}
  `;
	return new Map(rows.map((r) => [r.book_id, r.series_id]));
};

// positions: one per book, in the same order (e.g. 3, 4, 7.5); omitted -> 1..n
export type CreateManualSeriesEntry = { name: string; book_ids: number[]; positions?: number[] };
export type CreateManualSeriesResult = {
	series_id: number;
	name: string;
	books: ManualSeriesBookResult[];
};

const createOne = async (
	tx: postgres.Sql<{}>,
	{ name, book_ids: bookIds, positions }: CreateManualSeriesEntry
): Promise<CreateManualSeriesResult> => {
	const resolved = await resolveCanonicalIds(tx, bookIds);
	const canonicalIds = [...new Set(resolved)];
	if (positions && canonicalIds.length !== resolved.length) {
		// two ids that resolve to the same merged book would leave a position without a book
		throw new ManualSeriesError('同じ本が重複しています', 400, { book_ids: bookIds });
	}

	const taken = await tx<{ book_id: number; series_id: number }[]>`
    SELECT book_id, series_id FROM series_books
    WHERE source = 'manual' AND book_id IN ${tx(canonicalIds)}
  `;
	if (taken.length > 0) {
		throw new ManualSeriesError('既に手動でシリーズに登録されている本が含まれています', 409, {
			books: taken,
		});
	}

	const seriesId = await insertManualSeries(tx, name);
	const rows = canonicalIds.map((bookId, i) => ({
		book_id: bookId,
		source: 'manual',
		series_id: seriesId,
		position: positions ? positions[i] : i + 1,
	}));
	await tx`INSERT INTO series_books ${tx(rows)}`;

	const bookmeterSeries = await selectBookmeterSeries(tx, canonicalIds);
	return {
		series_id: seriesId,
		name,
		books: rows.map((r) => ({
			book_id: r.book_id,
			series_id: r.series_id,
			position: r.position,
			overrides_series_id: bookmeterSeries.get(r.book_id) ?? null,
		})),
	};
};

// New manual series, books at positions 1..n in the given order. One transaction for the whole
// batch (each insertManualSeries sees the ids allocated before it); any failure rolls everything
// back with the entry index in the error.
export const createManualSeriesBatch = async (
	sql: postgres.Sql<{}>,
	entries: CreateManualSeriesEntry[]
): Promise<CreateManualSeriesResult[]> =>
	sql.begin(async (tx) => {
		const results: CreateManualSeriesResult[] = [];
		for (const [index, entry] of entries.entries()) {
			try {
				results.push(await createOne(tx, entry));
			} catch (e) {
				throw withIndex(e, index);
			}
		}
		return results;
	});

export type AddManualSeriesBookEntry = {
	book_id: number;
	series_id: number;
	// An exact position (e.g. 7.1); omitted appends at the end
	position?: number;
};

const addOne = async (
	tx: postgres.Sql<{}>,
	entry: AddManualSeriesBookEntry
): Promise<ManualSeriesBookResult> => {
	const { book_id: bookId, series_id: seriesId } = entry;
	const [series] = await tx<{ id: number; superseded_by: number | null }[]>`
    SELECT id, superseded_by FROM series WHERE id = ${seriesId}
  `;
	if (!series) throw new ManualSeriesError('シリーズが存在しません', 404);
	if (series.superseded_by !== null) {
		throw new ManualSeriesError('このシリーズは統合済みです', 409, {
			superseded_by: series.superseded_by,
		});
	}

	const [canonicalId] = await resolveCanonicalIds(tx, [bookId]);

	const members = await selectSeriesMembers(tx, seriesId);
	if (members.some((m) => m.book_id === canonicalId)) {
		throw new ManualSeriesError('この本は既にこのシリーズに含まれています', 409);
	}
	let position: number;
	if (entry.position === undefined) {
		position = appendPosition(members);
	} else {
		position = entry.position;
		if (members.some((m) => m.position === position)) {
			throw new ManualSeriesError('この位置には既に本があります', 409, { position });
		}
	}

	// A book has at most one manual row: adding it here moves it out of any other manual series
	await tx`
    INSERT INTO series_books (book_id, source, series_id, position)
    VALUES (${canonicalId}, 'manual', ${seriesId}, ${position})
    ON CONFLICT (book_id, source) DO UPDATE SET
      series_id = EXCLUDED.series_id,
      position = EXCLUDED.position,
      updated_at = now()
  `;

	const bookmeterSeries = (await selectBookmeterSeries(tx, [canonicalId])).get(canonicalId);
	return {
		book_id: canonicalId,
		series_id: seriesId,
		position,
		overrides_series_id:
			bookmeterSeries !== undefined && bookmeterSeries !== seriesId ? bookmeterSeries : null,
	};
};

// Applied in order inside one transaction, so a later entry sees the books added before it
// (e.g. two appends land at last + 1, then last + 2). All or nothing: a failing entry rolls the batch back and
// its index is added to the error detail.
export const addManualSeriesBooks = async (
	sql: postgres.Sql<{}>,
	entries: AddManualSeriesBookEntry[]
): Promise<ManualSeriesBookResult[]> =>
	sql.begin(async (tx) => {
		const results: ManualSeriesBookResult[] = [];
		for (const [index, entry] of entries.entries()) {
			try {
				results.push(await addOne(tx, entry));
			} catch (e) {
				throw withIndex(e, index);
			}
		}
		return results;
	});

export const deleteManualSeriesBook = async (
	sql: postgres.Sql<{}>,
	bookId: number
): Promise<boolean> => {
	const [canonicalId] = await resolveCanonicalIds(sql, [bookId]);
	const rows = await sql`
    DELETE FROM series_books WHERE book_id = ${canonicalId} AND source = 'manual'
    RETURNING book_id
  `;
	return rows.length > 0;
};

export const deleteManualSeries = async (
	sql: postgres.Sql<{}>,
	seriesId: number
): Promise<void> => {
	const [series] = await sql<
		{ source: string }[]
	>`SELECT source FROM series WHERE id = ${seriesId}`;
	if (!series) throw new ManualSeriesError('シリーズが存在しません', 404);
	if (series.source !== 'manual') {
		throw new ManualSeriesError('Bookmeterのシリーズは削除できません', 400);
	}
	// ON DELETE CASCADE removes its series_books rows
	await sql`DELETE FROM series WHERE id = ${seriesId}`;
};

// Bookmeter series are renamed by the sync (upsertSeries), so only manual ones can be renamed here
export const renameManualSeries = async (
	sql: postgres.Sql<{}>,
	seriesId: number,
	name: string
): Promise<{ id: number; name: string }> => {
	const [series] = await sql<
		{ source: string }[]
	>`SELECT source FROM series WHERE id = ${seriesId}`;
	if (!series) throw new ManualSeriesError('シリーズが存在しません', 404);
	if (series.source !== 'manual') {
		throw new ManualSeriesError('Bookmeterのシリーズは名前を変更できません', 400);
	}
	await sql`UPDATE series SET name = ${name} WHERE id = ${seriesId}`;
	return { id: seriesId, name };
};

export type ManualSeriesLedgerRow = {
	book_id: number;
	title: string | null;
	series_id: number;
	series_name: string | null;
	series_source: string;
	position: number | null;
	bookmeter_series_id: number | null;
	bookmeter_position: number | null;
	// confirmed: Bookmeter agrees on the series; conflict: Bookmeter put it elsewhere;
	// pending: Bookmeter has no series for it yet
	status: 'confirmed' | 'conflict' | 'pending';
	updated_at: Date;
};

export const selectManualSeriesLedger = async (
	sql: postgres.Sql<{}>
): Promise<ManualSeriesLedgerRow[]> =>
	sql<ManualSeriesLedgerRow[]>`
    WITH bookmeter AS (
      SELECT DISTINCT ON (COALESCE(fm.base_id, sb.book_id))
        COALESCE(fm.base_id, sb.book_id) AS book_id, sb.series_id, sb.position
      FROM series_books sb
      LEFT JOIN final_book_merges fm ON fm.variant_id = sb.book_id
      WHERE sb.source = 'bookmeter'
      ORDER BY COALESCE(fm.base_id, sb.book_id), (sb.book_id = COALESCE(fm.base_id, sb.book_id)) DESC
    )
    SELECT
      m.book_id, b.title, m.series_id, s.name AS series_name, s.source AS series_source,
      m.position::float8 AS position,
      bm.series_id AS bookmeter_series_id, bm.position::float8 AS bookmeter_position,
      CASE
        WHEN bm.series_id IS NULL THEN 'pending'
        WHEN bm.series_id = m.series_id OR bm.series_id = s.superseded_by THEN 'confirmed'
        ELSE 'conflict'
      END AS status,
      m.updated_at
    FROM series_books m
    JOIN series s ON s.id = m.series_id
    LEFT JOIN books b ON b.id = m.book_id
    LEFT JOIN bookmeter bm ON bm.book_id = m.book_id
    WHERE m.source = 'manual'
    ORDER BY m.series_id, m.position ASC NULLS LAST, m.book_id
  `;

// Per-series blacklist of Bookmeter memberships (migrations/create_series_book_exclusions.sql).
// book_series ignores a Bookmeter row matching an exclusion; the sync can keep rewriting it.
export const excludeSeriesBook = async (
	sql: postgres.Sql<{}>,
	bookId: number,
	seriesId: number
): Promise<{ book_id: number; series_id: number }> => {
	const [canonicalId] = await resolveCanonicalIds(sql, [bookId]);
	const rows = await sql<{ source: string }[]>`
    SELECT sb.source
    FROM series_books sb
    LEFT JOIN final_book_merges fm ON fm.variant_id = sb.book_id
    WHERE sb.series_id = ${seriesId}
      AND COALESCE(fm.base_id, sb.book_id) = ${canonicalId}
  `;
	if (rows.some((r) => r.source === 'manual')) {
		// A manual membership wins over the exclusion; removing it is the way to take the book out
		throw new ManualSeriesError(
			'この本は手動でこのシリーズに登録されています。手動登録を削除してください',
			409
		);
	}
	if (!rows.some((r) => r.source === 'bookmeter')) {
		throw new ManualSeriesError('この本はBookmeterでこのシリーズに含まれていません', 404);
	}
	await sql`
    INSERT INTO series_book_exclusions (book_id, series_id)
    VALUES (${canonicalId}, ${seriesId})
    ON CONFLICT DO NOTHING
  `;
	return { book_id: canonicalId, series_id: seriesId };
};

export const deleteSeriesBookExclusion = async (
	sql: postgres.Sql<{}>,
	bookId: number,
	seriesId: number
): Promise<boolean> => {
	const [canonicalId] = await resolveCanonicalIds(sql, [bookId]);
	const rows = await sql`
    DELETE FROM series_book_exclusions
    WHERE book_id = ${canonicalId} AND series_id = ${seriesId}
    RETURNING book_id
  `;
	return rows.length > 0;
};

export type SeriesBookExclusionRow = {
	book_id: number;
	title: string | null;
	series_id: number;
	series_name: string | null;
	created_at: Date;
};

export const selectSeriesBookExclusions = async (
	sql: postgres.Sql<{}>
): Promise<SeriesBookExclusionRow[]> =>
	sql<SeriesBookExclusionRow[]>`
    SELECT e.book_id, b.title, e.series_id, s.name AS series_name, e.created_at
    FROM series_book_exclusions e
    JOIN series s ON s.id = e.series_id
    LEFT JOIN books b ON b.id = e.book_id
    ORDER BY e.series_id, e.book_id
  `;

// Bookmeter's convention: every series name ends in "シリーズ"
export const withSeriesSuffix = (name: string): string => {
	const trimmed = name.trim();
	return trimmed.endsWith('シリーズ') ? trimmed : `${trimmed}シリーズ`;
};

export type SeriesScanDecision = {
	fingerprint: string;
	kind: 'new_series' | 'add_to_series';
	decision: 'approved' | 'rejected';
	book_ids: number[];
	series_id: number | null;
	confidence: number | null;
};

// Review decisions from the series scan; a later scan skips anything recorded here
export const upsertSeriesScanDecisions = async (
	sql: postgres.Sql<{}>,
	decisions: SeriesScanDecision[]
): Promise<void> => {
	if (decisions.length === 0) return;
	await sql`
    INSERT INTO series_scan_decisions ${sql(
			decisions.map((d) => ({ ...d, book_ids: pgIntArray(d.book_ids) })),
			'fingerprint',
			'kind',
			'decision',
			'book_ids',
			'series_id',
			'confidence'
		)}
    ON CONFLICT (fingerprint) DO UPDATE SET
      decision = EXCLUDED.decision,
      book_ids = EXCLUDED.book_ids,
      series_id = EXCLUDED.series_id,
      confidence = EXCLUDED.confidence,
      created_at = now()
  `;
};

export const selectSeriesScanDecisions = async (
	sql: postgres.Sql<{}>
): Promise<(SeriesScanDecision & { created_at: Date })[]> =>
	sql<(SeriesScanDecision & { created_at: Date })[]>`
    SELECT fingerprint, kind, decision, book_ids, series_id, confidence, created_at
    FROM series_scan_decisions
    ORDER BY created_at DESC
  `;
