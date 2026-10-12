import postgres from 'postgres';
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

// Position for a book placed after `anchorId`, halfway to the next book (8 and 9 -> 8.5).
// anchorId undefined appends after the last positioned book; null places the book first.
const positionAfter = (members: Member[], anchorId: number | null | undefined): number => {
	const positioned = members.filter((m): m is { book_id: number; position: number } =>
		m.position !== null
	);
	if (anchorId === undefined) {
		const last = positioned.at(-1)?.position ?? 0;
		return Math.floor(last) + 1;
	}

	let lower = 0;
	let upper: number | undefined = positioned[0]?.position;
	if (anchorId !== null) {
		const index = positioned.findIndex((m) => m.book_id === anchorId);
		if (index === -1) {
			const unpositioned = members.some((m) => m.book_id === anchorId);
			throw new ManualSeriesError(
				unpositioned
					? 'after_book_idの本には位置がないため基準にできません'
					: 'after_book_idの本はこのシリーズに含まれていません',
				400
			);
		}
		lower = positioned[index].position;
		upper = positioned[index + 1]?.position;
	}

	if (upper === undefined) return Math.floor(lower) + 1;
	const position = round2((lower + upper) / 2);
	// numeric(8,2): two decimals, so repeated halving of the same gap eventually runs out
	if (position <= lower || position >= upper) {
		throw new ManualSeriesError('この位置にはこれ以上本を挿入できません', 409, { lower, upper });
	}
	return position;
};

export type ManualSeriesBookResult = {
	book_id: number;
	series_id: number;
	position: number;
	anchor_book_id: number | null;
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

export const createManualSeries = async (
	sql: postgres.Sql<{}>,
	name: string,
	bookIds: number[]
): Promise<{ series_id: number; books: ManualSeriesBookResult[] }> =>
	sql.begin(async (tx) => {
		const canonicalIds = [...new Set(await resolveCanonicalIds(tx, bookIds))];

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
			position: i + 1,
			anchor_book_id: i === 0 ? null : canonicalIds[i - 1],
		}));
		await tx`INSERT INTO series_books ${tx(rows)}`;

		const bookmeterSeries = await selectBookmeterSeries(tx, canonicalIds);
		return {
			series_id: seriesId,
			books: rows.map((r) => ({
				book_id: r.book_id,
				series_id: r.series_id,
				position: r.position,
				anchor_book_id: r.anchor_book_id,
				overrides_series_id: bookmeterSeries.get(r.book_id) ?? null,
			})),
		};
	});

export const addManualSeriesBook = async (
	sql: postgres.Sql<{}>,
	bookId: number,
	seriesId: number,
	afterBookId: number | null | undefined
): Promise<ManualSeriesBookResult> =>
	sql.begin(async (tx) => {
		const [series] = await tx<{ id: number; superseded_by: number | null }[]>`
      SELECT id, superseded_by FROM series WHERE id = ${seriesId}
    `;
		if (!series) throw new ManualSeriesError('シリーズが存在しません', 404);
		if (series.superseded_by !== null) {
			throw new ManualSeriesError('このシリーズは統合済みです', 409, {
				superseded_by: series.superseded_by,
			});
		}

		const [canonicalId, canonicalAnchor] = await resolveCanonicalIds(
			tx,
			afterBookId == null ? [bookId] : [bookId, afterBookId]
		);
		const anchorId = afterBookId == null ? afterBookId : canonicalAnchor;

		const members = await selectSeriesMembers(tx, seriesId);
		if (members.some((m) => m.book_id === canonicalId)) {
			throw new ManualSeriesError('この本は既にこのシリーズに含まれています', 409);
		}
		const position = positionAfter(members, anchorId);

		// A book has at most one manual row: adding it here moves it out of any other manual series
		await tx`
      INSERT INTO series_books (book_id, source, series_id, position, anchor_book_id)
      VALUES (${canonicalId}, 'manual', ${seriesId}, ${position}, ${anchorId ?? null})
      ON CONFLICT (book_id, source) DO UPDATE SET
        series_id = EXCLUDED.series_id,
        position = EXCLUDED.position,
        anchor_book_id = EXCLUDED.anchor_book_id,
        updated_at = now()
    `;

		const bookmeterSeries = (await selectBookmeterSeries(tx, [canonicalId])).get(canonicalId);
		return {
			book_id: canonicalId,
			series_id: seriesId,
			position,
			anchor_book_id: anchorId ?? null,
			overrides_series_id:
				bookmeterSeries !== undefined && bookmeterSeries !== seriesId ? bookmeterSeries : null,
		};
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
	const [series] = await sql<{ source: string }[]>`SELECT source FROM series WHERE id = ${seriesId}`;
	if (!series) throw new ManualSeriesError('シリーズが存在しません', 404);
	if (series.source !== 'manual') {
		throw new ManualSeriesError('Bookmeterのシリーズは削除できません', 400);
	}
	// ON DELETE CASCADE removes its series_books rows
	await sql`DELETE FROM series WHERE id = ${seriesId}`;
};

export type ManualSeriesLedgerRow = {
	book_id: number;
	title: string | null;
	series_id: number;
	series_name: string | null;
	series_source: string;
	position: number | null;
	anchor_book_id: number | null;
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
      m.position::float8 AS position, m.anchor_book_id,
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
