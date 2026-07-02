import postgres from 'postgres';
import { Book } from './models';
import { refreshAll } from './users';

export const updateReadsMergedBookIds = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    UPDATE reads
    SET merged_book_id = book_id
  `;

	await sql`
    UPDATE reads
    SET merged_book_id = fm.base_id
    FROM final_book_merges fm
    WHERE reads.book_id = fm.variant_id;
  `;
};

export const syncBookMerges = async (sql: postgres.Sql<{}>): Promise<void> => {
	await sql`
    DELETE FROM book_merges;
  `;

	await sql`
    WITH cleaned_books AS (
      SELECT
        id,
        remove_spaces(author) AS author,
        normalize_title(title) AS title,
        LENGTH(title) - LENGTH(REPLACE(title, '(', '')) AS open_paren_count,
        remove_parentheses(normalize_title(title)) AS title_no_paren
      FROM books
    ),
    base_books AS (
      SELECT DISTINCT ON (author, title)
        id, author, title, open_paren_count, title_no_paren
      FROM cleaned_books
      ORDER BY author, title, id
    ),
    variants AS (
      SELECT
        b_base.id AS base_id,
        b_var.id AS variant_id
      FROM base_books b_base
      JOIN cleaned_books b_var
        ON b_base.author = b_var.author
        AND b_base.id != b_var.id
        AND (
          (
            b_var.title &^ b_base.title
            AND LENGTH(b_var.title) - LENGTH(b_base.title) > 4
            AND b_var.open_paren_count - b_base.open_paren_count = 1
            AND b_var.title_no_paren = b_base.title_no_paren
          )
          OR (
            b_base.title = b_var.title
            AND b_base.id < b_var.id
          )
        )
    )
    INSERT INTO book_merges (variant_id, base_id)
    SELECT
      v.variant_id,
      v.base_id
    FROM variants v
    ON CONFLICT (variant_id) DO NOTHING;
  `;

	await updateReadsMergedBookIds(sql);
};

export const addManualBookMerge = async (
	sql: postgres.Sql<{}>,
	baseId: number,
	variantId: number
): Promise<void> => {
	await sql`
    INSERT INTO manual_book_merges (variant_id, base_id)
    VALUES (${variantId}, ${baseId})
  `;

	await refreshAll(sql);
};

export const addBookMergeException = async (
	sql: postgres.Sql<{}>,
	variantId: number
): Promise<void> => {
	await sql`
    INSERT INTO book_merge_exceptions (variant_id)
    VALUES (${variantId})
  `;

	await refreshAll(sql);
};

export const deleteManualBookMerge = async (
	sql: postgres.Sql<{}>,
	variantId: number
): Promise<void> => {
	await sql`
    DELETE FROM manual_book_merges
    WHERE variant_id = ${variantId}
  `;

	await refreshAll(sql);
};

export const deleteBookMergeException = async (
	sql: postgres.Sql<{}>,
	variantId: number
): Promise<void> => {
	await sql`
    DELETE FROM book_merge_exceptions
    WHERE variant_id = ${variantId}
  `;

	await refreshAll(sql);
};

export type DuplicateCandidateBook = {
	id: number;
	title: string;
	author: string;
	thumbnail_url: string | null;
	read_count: number;
	series_id: number | null;
	series_name: string | null;
};

export type PotentialBookMerge = {
	base: DuplicateCandidateBook;
	variants: DuplicateCandidateBook[];
};

// Punctuation/whitespace stripped when comparing titles — mirrors .claude/merge-books.md Step 2a
const PUNCTUATION_REGEX =
	/[\s　\-・＝=_[\]【】「」『』（）()［］<>《》〈〉〔〕{}。、.,!！?？~～…・/／\\]/g;

const normalize = (s: string): string =>
	s.normalize('NFKC').replace(PUNCTUATION_REGEX, '').toLowerCase();

// A bare number, number range, roman numeral, or single-kanji volume word is a meaningful volume
// marker, not decorative — never strip it (e.g. "本（1～４５）" vs "本（46～90）" are different
// volume ranges, not duplicates; validated against all 540 confirmed book merges in production)
const isVolumeMarker = (s: string): boolean => {
	const trimmed = s.trim();
	if (/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) return true;
	if (/^[0-9]+(\.[0-9]+)?\s*[~〜～\-－ー]\s*[0-9]+(\.[0-9]+)?$/.test(trimmed)) return true;
	if (/^[ivx]+$/i.test(trimmed)) return true;
	// "Lv.10", "vol.3", "Vol 5" — prefixed volume/level labels
	if (/^(lv|vol|volume)\.?\s*[0-9]+(\.[0-9]+)?$/i.test(trimmed)) return true;
	// "2回目", "第3巻", "第4章" — suffixed/prefixed Japanese volume counters
	if (/^[0-9]+(\.[0-9]+)?\s*回目$/.test(trimmed)) return true;
	if (/^第[0-9]+(\.[0-9]+)?\s*(巻|話|章|部)$/.test(trimmed)) return true;
	return ['上', '中', '下', '前', '後', '完', '黒', '白'].includes(trimmed);
};

// Reprint/edition markers that don't change the underlying book — stripped wherever they occur,
// not just trailing (e.g. "新装版 限りなく透明に近いブルー" vs "限りなく透明に近いブルー")
const EDITION_MARKERS = ['新装改訂版', '新装版', '完全版', '愛蔵版', '図書館版'];
const stripEditionMarkers = (s: string): string =>
	EDITION_MARKERS.reduce((acc, marker) => acc.split(marker).join(''), s);

// Strips a trailing parenthesized publisher/catalog suffix, e.g. "(講談社BOX)" "(角川文庫 か 1-2)".
// Iterative to catch double-stacked suffixes, e.g. "告白 (双葉文庫) (双葉文庫 み 21-1)".
const stripTrailingRoundParens = (s: string): string => {
	let current = s.trim();
	for (;;) {
		const match = current.match(/[(（]([^()（）]{1,30})[)）]\s*$/);
		if (!match) return current;
		if (isVolumeMarker(match[1])) return current;
		current = current.slice(0, match.index).trim();
	}
};

// "IV" <-> "4" — same volume, different numeral system (e.g. "狼と香辛料IV" vs "狼と香辛料 (4)")
const ROMAN_TO_ARABIC: [string, string][] = [
	['VIII', '8'],
	['VII', '7'],
	['III', '3'],
	['IV', '4'],
	['IX', '9'],
	['VI', '6'],
	['II', '2'],
	['V', '5'],
	['X', '10'],
	['I', '1'],
];
const romanToArabic = (s: string): string =>
	ROMAN_TO_ARABIC.reduce(
		(acc, [roman, arabic]) =>
			acc.replace(new RegExp(`(?<![A-Za-z])${roman}(?![A-Za-z])`, 'g'), arabic),
		s
	);

const canonicalizeTitle = (title: string): string => {
	const nfkc = title.normalize('NFKC');
	const noEdition = stripEditionMarkers(nfkc);
	const noSuffix = stripTrailingRoundParens(noEdition);
	return romanToArabic(noSuffix);
};

const duplicateKey = (title: string, author: string): string =>
	`${normalize(canonicalizeTitle(title))}|${normalize(author)}`;

type BookPair = { id1: number; id2: number };

// Ported from syncBookMerges (src/db/book_merges.ts) — the same rule the production auto-merge
// job uses (extra ASCII-paren annotation with matching paren-stripped title, or an exact match
// after space/digit normalization). Scoped to still-active books so it surfaces pairs the cron
// job hasn't auto-merged yet, and catches cases our NFKC heuristic above might miss.
const selectAlgorithmicDuplicatePairs = async (sql: postgres.Sql<{}>): Promise<BookPair[]> => {
	return await sql<BookPair[]>`
    WITH active_books AS (
      SELECT DISTINCT b.id, b.title, b.author
      FROM reads r
      JOIN books b ON b.id = r.merged_book_id
    ),
    cleaned AS (
      SELECT
        id,
        remove_spaces(author) AS author,
        normalize_title(title) AS title,
        LENGTH(title) - LENGTH(REPLACE(title, '(', '')) AS open_paren_count,
        remove_parentheses(normalize_title(title)) AS title_no_paren
      FROM active_books
    )
    SELECT c1.id AS id1, c2.id AS id2
    FROM cleaned c1
    JOIN cleaned c2
      ON c1.author = c2.author
      AND c1.id < c2.id
      AND (
        (
          c2.title &^ c1.title
          AND LENGTH(c2.title) - LENGTH(c1.title) > 4
          AND c2.open_paren_count - c1.open_paren_count = 1
          AND c2.title_no_paren = c1.title_no_paren
        )
        OR c1.title = c2.title
      )
  `;
};

class UnionFind {
	private parent = new Map<number, number>();

	find(x: number): number {
		const p = this.parent.get(x) ?? x;
		if (p === x) return x;
		const root = this.find(p);
		this.parent.set(x, root);
		return root;
	}

	union(a: number, b: number): void {
		const rootA = this.find(a);
		const rootB = this.find(b);
		if (rootA !== rootB) this.parent.set(rootA, rootB);
	}
}

export const selectDuplicateBookCandidates = async (
	sql: postgres.Sql<{}>
): Promise<PotentialBookMerge[]> => {
	const activeBooks = await sql<DuplicateCandidateBook[]>`
    SELECT b.id, b.title, b.author, b.thumbnail_url, COUNT(r.id)::int AS read_count,
           s.id AS series_id, s.name AS series_name
    FROM reads r
    JOIN books b ON b.id = r.merged_book_id
    LEFT JOIN series s ON s.id = b.series_id
    GROUP BY b.id, b.title, b.author, b.thumbnail_url, s.id, s.name
  `;

	const exceptionRows = await sql<{ variant_id: number }[]>`
    SELECT variant_id FROM book_merge_exceptions
  `;
	const exceptions = new Set(exceptionRows.map((r) => r.variant_id));

	const byId = new Map(activeBooks.map((book) => [book.id, book]));
	const dsu = new UnionFind();

	const keyGroups = new Map<string, number[]>();
	for (const book of activeBooks) {
		if (exceptions.has(book.id)) continue;
		const key = duplicateKey(book.title, book.author);
		const ids = keyGroups.get(key);
		if (ids) ids.push(book.id);
		else keyGroups.set(key, [book.id]);
	}
	for (const ids of keyGroups.values()) {
		for (let i = 1; i < ids.length; i++) dsu.union(ids[0], ids[i]);
	}

	const algorithmicPairs = await selectAlgorithmicDuplicatePairs(sql);
	for (const { id1, id2 } of algorithmicPairs) {
		if (exceptions.has(id1) || exceptions.has(id2)) continue;
		if (!byId.has(id1) || !byId.has(id2)) continue;
		dsu.union(id1, id2);
	}

	const components = new Map<number, number[]>();
	for (const book of activeBooks) {
		if (exceptions.has(book.id)) continue;
		const root = dsu.find(book.id);
		const ids = components.get(root);
		if (ids) ids.push(book.id);
		else components.set(root, [book.id]);
	}

	// Prefer the book that belongs to a series as base, even if it has fewer reads
	const rankBook = (a: DuplicateCandidateBook, b: DuplicateCandidateBook): number => {
		if ((a.series_id !== null) !== (b.series_id !== null)) {
			return a.series_id !== null ? -1 : 1;
		}
		return b.read_count - a.read_count;
	};

	return Array.from(components.values())
		.filter((ids) => ids.length > 1)
		.map((ids) => ids.map((id) => byId.get(id)!).sort(rankBook))
		.sort((a, b) => b[0].read_count - a[0].read_count)
		.map(([base, ...variants]) => ({ base, variants }));
};

type BookMergeItem = Omit<Book, 'page' | 'author_url'> & { read_count: number };
type FinalBookMerge = {
	base: BookMergeItem;
	variants: BookMergeItem[];
};
export const getFinalBookMerges = async (sql: postgres.Sql<{}>): Promise<FinalBookMerge[]> => {
	const rows = await sql`
    WITH read_counts AS (
      SELECT book_id, COUNT(*)::int AS read_count FROM reads GROUP BY book_id
    )
    SELECT
        fm.base_id,
        base_book.title AS base_title,
        base_book.author AS base_author,
        base_book.thumbnail_url AS base_thumbnail,
        base_series.id AS base_series_id,
        base_series.name AS base_series_name,
        COALESCE(base_reads.read_count, 0) AS base_read_count,

        fm.variant_id,
        variant_book.title AS variant_title,
        variant_book.author AS variant_author,
        variant_book.thumbnail_url AS variant_thumbnail,
        variant_series.id AS variant_series_id,
        variant_series.name AS variant_series_name,
        COALESCE(variant_reads.read_count, 0) AS variant_read_count
    FROM final_book_merges fm
    JOIN books AS base_book
        ON base_book.id = fm.base_id
    LEFT JOIN series AS base_series
        ON base_series.id = base_book.series_id
    LEFT JOIN read_counts AS base_reads
        ON base_reads.book_id = base_book.id
    JOIN books AS variant_book
        ON variant_book.id = fm.variant_id
    LEFT JOIN series AS variant_series
        ON variant_series.id = variant_book.series_id
    LEFT JOIN read_counts AS variant_reads
        ON variant_reads.book_id = variant_book.id
    ORDER BY fm.base_id, fm.variant_id;
  `;

	// Group variants by base book
	const mergeMap = new Map<number, FinalBookMerge>();

	for (const row of rows) {
		if (!mergeMap.has(row.base_id)) {
			mergeMap.set(row.base_id, {
				base: {
					id: row.base_id,
					title: row.base_title,
					author: row.base_author,
					thumbnail_url: row.base_thumbnail,
					series_id: row.base_series_id,
					series_name: row.base_series_name,
					read_count: row.base_read_count,
				},
				variants: [],
			});
		}

		mergeMap.get(row.base_id)!.variants.push({
			id: row.variant_id,
			title: row.variant_title,
			author: row.variant_author,
			thumbnail_url: row.variant_thumbnail,
			series_id: row.variant_series_id,
			series_name: row.variant_series_name,
			read_count: row.variant_read_count,
		});
	}

	return Array.from(mergeMap.values());
};

export type MergeChain = {
	// the variant that is ALSO a base elsewhere, e.g. B in "A => B" and "B => C"
	middle: BookMergeItem;
	// the base B should really point to directly, e.g. C
	base: BookMergeItem;
	// the variants stuck one hop behind the real base, e.g. [A]
	variants: BookMergeItem[];
};

// getFinalBookMerges should return a flat map: every group is {base, variants} with no group's
// base also showing up as another group's variant. A chain (A => B, B => C) means B never got
// flattened to C, so A ends up merged into B instead of the real base C.
export const selectBookMergeChains = async (sql: postgres.Sql<{}>): Promise<MergeChain[]> => {
	const merges = await getFinalBookMerges(sql);
	const groupByBaseId = new Map(merges.map((merge) => [merge.base.id, merge]));

	const chains: MergeChain[] = [];
	for (const merge of merges) {
		for (const variant of merge.variants) {
			const chainedGroup = groupByBaseId.get(variant.id);
			if (chainedGroup) {
				chains.push({ middle: variant, base: merge.base, variants: chainedGroup.variants });
			}
		}
	}

	return chains;
};
