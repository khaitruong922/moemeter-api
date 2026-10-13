// Sequel finder: for every manual series, search Bookmeter for volumes that are not in the series —
// usually ones nobody in the group has logged, so the local scan cannot see them. Writes
// sequels.json next to candidates.json; render merges it into review.html as the 続刊 tab.
// Read-only against the database. See .claude/skills/series-scan/SKILL.md.
//
//   npm run series:sequels -- <out dir> [<bookwalker.sqlite>] [--series 100000466,100000000] [--concurrency 3]
//
// A search result counts as a volume only if its title stem matches the series' stem (or starts
// with it), its first author matches, and its imprint matches when both are known. Books already
// in the series, excluded from it, already in another series, other editions of a volume that is
// there, and bonus listings are never proposed. Searches are cached for a week and spaced ~1 s
// apart.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { canonicalizeTitle, normalize } from '../../src/db/book_merges';
import type { AdditionCandidate, CandidateBook } from './scan';
import { imprintOf, normalizeImprint, splitVolume, type VolumeSplit } from './volume';

const SEARCH = 'https://bookmeter.com/api/v1/search/books.json';
const PAGE_SIZE = 20;
const MAX_PAGES = 3; // 60 results: enough for a series' volumes, and bounds the run
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
// Bookmeter allows a burst of ~20 requests, then answers 503. Measured 2026-10-13: 3 in parallel
// sustained 2.4 req/s with no errors; 5 and 8 lost about half to 503. Throttled requests retry.
const DEFAULT_CONCURRENCY = 3;
const MAX_RETRIES = 5;
const BONUS_TITLE = /購入特典|限定書き下ろし|ショートストーリー$|特装版/;
// box sets and omnibus listings: 「14冊セット」「全15冊セット」「1-11巻+4.5巻…セット」「BOX」「合本」
const BUNDLE_TITLE = /セット|BOX|ＢＯＸ|合本|全\s*[0-9０-９]+\s*[冊巻]/i;
// companion books, not volumes
const COMPANION_TITLE =
	/ガイドブック|GUIDE\s*BOOK|コンプリートブック|カレンダー|ハンドブック|キャラクターブック|ファンブック|画集|設定資料|ビジュアル|アートブック|ART\s*WORK|イラスト集|公式|ムック|映画原作|映画化記念/i;
// comics labels: a prose series' volume is never filed under one (that is the manga)
const COMIC_IMPRINT = /コミック|comics?|kc|ガンガン|まんが|マンガ/i;
const MAX_STEMS = 3;
// Bookmeter's search returns only a slice of a busy keyword (「恐怖コレクター」: 35 results, 18 of
// the series), so missing numbers get one targeted search each, capped per series
// per missing volume, not per series: マリア様がみてる (28–35 missing) used up a shared 30-search
// budget on its first volumes' variants. Each volume stops at its first hit.
const MAX_GAP_VOLUMES = 40;
const MAX_VARIANTS = 7;
// last resort when volumes are still missing: the author's books, page by page
const AUTHOR_SWEEP_PAGES = 10;

// An imprint written inside the title rather than after it: 「監禁王（ブレイブ文庫）７」 is 監禁王 7
// under ブレイブ文庫 (a reissue), not a series called 「監禁王（ブレイブ文庫）」
const INNER_IMPRINT =
	/\s*[(（]([^()（）]*(?:文庫|ノベル|NOVELS|ブックス|BOOKS)[^()（）]*)[)）]\s*(?=.)/i;
const splitResult = (title: string) =>
	splitVolume(title.normalize('NFKC').replace(INNER_IMPRINT, ' '));
const imprintOfResult = (title: string) => {
	const inner = title.normalize('NFKC').match(INNER_IMPRINT)?.[1];
	return imprintOf(title) ?? (inner ? normalizeImprint(inner) : null);
};

const KANJI_DIGIT = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
// 1..99 in kanji: 11 -> 十一, 20 -> 二十, 23 -> 二十三
const toKanji = (n: number): string => {
	const tens = Math.floor(n / 10);
	const ones = n % 10;
	return (tens > 1 ? KANJI_DIGIT[tens] : '') + (tens > 0 ? '十' : '') + KANJI_DIGIT[ones];
};

// The title of volume v with its number swapped for n and cut right after it — the query for a
// missing volume when BookWalker has no title for it: 「恐怖コレクター 巻ノ十 届かない想い」, 11 ->
// 「恐怖コレクター 巻ノ十一」, 「魔女と猟犬 (3)」, 4 -> 「魔女と猟犬 (4)」
const swapVolume = (title: string, v: number, n: number): string | null => {
	const t = title.normalize('NFKC');
	const forms: [RegExp, string][] = [
		[new RegExp(`(?<![0-9.])${v}(?![0-9.])`), String(n)],
		[new RegExp(`(?<![一二三四五六七八九十])${toKanji(v)}(?![一二三四五六七八九十])`), toKanji(n)],
	];
	for (const [pattern, replacement] of forms) {
		const m = t.match(pattern);
		if (!m || m.index === undefined || m.index < 2) continue;
		const rest = t.slice(m.index + m[0].length);
		const tail = rest.match(/^\s*(?:巻|話|集)?[)\]〉》]?/)?.[0] ?? '';
		// keep a trailing imprint: Bookmeter's relevance needs it — 「槍使いと、黒猫。5 (HJ NOVELS)」
		// finds volume 5, 「槍使いと、黒猫。5」 does not
		const imprint =
			rest.match(/\([^()]*(?:文庫|ノベル|NOVELS|ブックス|BOOKS|BOX)[^()]*\)\s*$/i)?.[0] ?? '';
		return `${(t.slice(0, m.index) + replacement + tail).trim()} ${imprint}`.trim();
	}
	return null;
}; // arcs searched per series (1年生編 / 2年生編 / 3年生編)

type Result = {
	id: number;
	title: string;
	image_url: string | null;
	page: number | null;
	published_at: string | null;
	registration_count: number;
	author: { name: string; path: string } | null;
};

export type SequelCandidate = AdditionCandidate & {
	// set when the book is not in `books` yet; apply inserts it before adding
	import?: {
		title: string;
		author: string | null;
		author_url: string | null;
		thumbnail_url: string | null;
		page: number | null;
	};
	published_at: string | null;
	registration_count: number;
};

export type SequelResult = {
	generated_at: string;
	stats: Record<string, number>;
	sequels: SequelCandidate[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.max(0.05, Math.min(0.99, round2(n)));
const authorKeyOf = (author: string | null) => normalize((author ?? '').split(/[,、]/)[0]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// search results come at 120px; the database stores the larger 500px cover
const biggerCover = (url: string | null) => url?.replace(/\._SL\d+_\./, '._SL500_.') ?? null;

const readDatabaseUrl = (): string => {
	const line = readFileSync('.dev.vars', 'utf8')
		.split('\n')
		.find((l) => l.startsWith('DATABASE_URL='));
	if (!line) throw new Error('DATABASE_URL missing from .dev.vars');
	return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim();
};

const main = async () => {
	const args = process.argv.slice(2);
	const seriesFlag = args.indexOf('--series');
	const onlySeries = seriesFlag >= 0 ? new Set(args[seriesFlag + 1].split(',').map(Number)) : null;
	const concurrencyFlag = args.indexOf('--concurrency');
	const concurrency =
		concurrencyFlag >= 0 ? Math.max(1, Number(args[concurrencyFlag + 1])) : DEFAULT_CONCURRENCY;
	const [outDir, bwPath] = args.filter(
		(a, i) => !a.startsWith('--') && args[i - 1] !== '--series' && args[i - 1] !== '--concurrency'
	);
	if (!outDir) {
		console.error('usage: series:sequels <out dir> [<bookwalker.sqlite>]');
		process.exit(1);
	}
	// Outside the project: a dev server watching the project (VS Code Live Server serving
	// review.html) reloads on every cache write while a run is in progress
	const cacheDir =
		process.env.SERIES_SCAN_CACHE ??
		join(homedir(), 'Library', 'Caches', 'moemeter-series-scan', 'bookmeter-search');
	mkdirSync(cacheDir, { recursive: true });

	// ---- load (read-only; prepare:false for the transaction pooler) ----
	const sql = postgres(readDatabaseUrl(), { prepare: false, max: 1 });
	const data = await sql.begin('read only', async (tx) => ({
		members: await tx<
			{
				series_id: number;
				series_name: string;
				id: number;
				title: string;
				author: string | null;
				thumbnail_url: string | null;
				position: number | null;
			}[]
		>`
      SELECT s.id AS series_id, s.name AS series_name, b.id, b.title, b.author, b.thumbnail_url,
             bs.position::float8 AS position
      FROM series s
      JOIN book_series bs ON bs.series_id = s.id
      JOIN books b ON b.id = bs.book_id
      WHERE s.source = 'manual' AND s.superseded_by IS NULL
    `,
		// canonical id of every known book, and the series it is in (if any)
		known: await tx<{ id: number; canonical: number; series_id: number | null }[]>`
      SELECT b.id, COALESCE(fm.base_id, b.id) AS canonical, bs.series_id
      FROM books b
      LEFT JOIN final_book_merges fm ON fm.variant_id = b.id
      LEFT JOIN book_series bs ON bs.book_id = COALESCE(fm.base_id, b.id)
    `,
		blacklisted: await tx<{ id: number }[]>`SELECT id FROM blacklisted_books`,
		exclusions: await tx<{ book_id: number; series_id: number }[]>`
      SELECT book_id, series_id FROM series_book_exclusions
    `,
		decided: await tx<{ fingerprint: string }[]>`SELECT fingerprint FROM series_scan_decisions`,
	}));
	await sql.end();

	const known = new Map(data.known.map((k) => [k.id, k]));
	const blacklisted = new Set(data.blacklisted.map((b) => b.id));
	const excluded = new Set(data.exclusions.map((e) => `${e.book_id}:${e.series_id}`));
	const decided = new Set(data.decided.map((d) => d.fingerprint));

	// ---- optional BookWalker cross-check ----
	const bw = bwPath && existsSync(bwPath) ? new DatabaseSync(bwPath, { readOnly: true }) : null;
	const bwByTitle = bw?.prepare(
		'SELECT series_id, label_key, volume FROM volumes WHERE title_key = ?'
	);
	const bwSeriesVolumes = bw?.prepare(
		'SELECT title, volume FROM volumes WHERE series_id = ? AND volume IS NOT NULL'
	);
	const bwOf = (title: string, imprint: string | null) => {
		if (!bwByTitle) return null;
		const rows = bwByTitle.all(normalize(canonicalizeTitle(title))) as {
			series_id: number | null;
			label_key: string | null;
			volume: number | null;
		}[];
		const fit = rows.filter(
			(r) => r.series_id !== null && (!imprint || !r.label_key || r.label_key === imprint)
		);
		const ids = [...new Set(fit.map((r) => r.series_id))];
		return ids.length === 1 ? { series_id: ids[0] as number, volume: fit[0].volume } : null;
	};

	// ---- group members by series ----
	type Member = (typeof data.members)[number] & { split: VolumeSplit; imprint: string | null };
	const bySeries = new Map<number, Member[]>();
	for (const m of data.members) {
		if (onlySeries && !onlySeries.has(m.series_id)) continue;
		const member = { ...m, split: splitVolume(m.title), imprint: imprintOf(m.title) };
		bySeries.set(m.series_id, [...(bySeries.get(m.series_id) ?? []), member]);
	}

	// ---- Bookmeter search, cached ----
	let requests = 0;
	let retries = 0;
	let cacheHits = 0;
	const search = async (keyword: string, maxPages = MAX_PAGES): Promise<Result[]> => {
		const cacheKey = maxPages === MAX_PAGES ? keyword : `${keyword}|${maxPages}`;
		const file = join(cacheDir, createHash('sha1').update(cacheKey).digest('hex') + '.json');
		if (existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_TTL_MS) {
			cacheHits++;
			return JSON.parse(readFileSync(file, 'utf8'));
		}
		const results: Result[] = [];
		for (let page = 0; page < maxPages; page++) {
			const url = `${SEARCH}?keyword=${encodeURIComponent(keyword)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
			let res: Response | null = null;
			for (let attempt = 0; ; attempt++) {
				requests++;
				res = await fetch(url, { headers: { 'User-Agent': 'moemeter-series-scan' } });
				if (res.ok || ![429, 503].includes(res.status) || attempt >= MAX_RETRIES) break;
				// throttled: back off (Retry-After when given, else 2 s, 4 s, 8 s…)
				retries++;
				const after = Number(res.headers.get('retry-after'));
				await sleep(after > 0 ? after * 1000 : 2000 * 2 ** attempt);
			}
			if (!res.ok) throw new Error(`Bookmeter search ${res.status} for ${keyword}`);
			const body = (await res.json()) as { metadata: { count: number }; resources: Result[] };
			results.push(...body.resources);
			if ((page + 1) * PAGE_SIZE >= body.metadata.count) break;
		}
		writeFileSync(file, JSON.stringify(results));
		return results;
	};

	const sequels: SequelCandidate[] = [];
	// which volume a candidate is: several Bookmeter records (regular, 特装版, reissue…) can be the
	// same volume; only the most-registered one is proposed
	const volumeKey = new Map<SequelCandidate, string>();
	let searched = 0;
	let gapSearches = 0;
	let authorSweeps = 0;
	const total = bySeries.size;
	const processSeries = async (seriesId: number, members: Member[]) => {
		members.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
		// the stem most of the series' books share — the numbered ones are the most reliable
		const counts = new Map<string, { stem: string; n: number }>();
		for (const m of members) {
			if (m.split.stemKey.length < 3) continue;
			const c = counts.get(m.split.stemKey) ?? { stem: m.split.stem, n: 0 };
			c.n += m.split.volume !== null ? 2 : 1;
			counts.set(m.split.stemKey, c);
		}
		// one search per arc: a series' main stem alone can bury later arcs (3年生編5) beyond the
		// first pages of a busy keyword
		const stems = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, MAX_STEMS);
		if (stems.length === 0) return;
		const stemKeys = new Set(stems.map(([k]) => k));
		// every member's own stem, searched or not: 「…吹奏楽部日誌２」 belongs with the series'
		// 「…吹奏楽部日誌」, not the main 響け! ユーフォニアム arc it also extends
		const memberStems = new Set(members.map((m) => m.split.stemKey));
		// Which arc a result belongs to: its stem equals an arc stem, extends it, or — for titles that
		// put the number straight after a short head (「ヘルモード１０ ～やり込み好きの…～」 has stem
		// 「ヘルモード」) — is a prefix of it of at least 4 characters. Longest arc wins.
		const arcOf = (stemKey: string, title: string): string | null => {
			// the title with its volume number taken out: 「ヘルモード１０ ～やり込み好きの…～」 ->
			// 「ヘルモード～やり込み好きの…～」, which does start with the arc; the main Re:ゼロ volumes
			// stay 「Re:ゼロから始める異世界生活」 and do not start with the Ex arc
			const withoutNumber = normalize(
				canonicalizeTitle(
					title
						.normalize('NFKC')
						.replace(INNER_IMPRINT, ' ')
						.replace(/[0-9]+(?:\.[0-9]+)?/, '')
				)
			);
			if (memberStems.has(stemKey)) return stemKey;
			let best: string | null = null;
			for (const k of stemKeys) {
				const fits =
					stemKey === k ||
					stemKey.startsWith(k) ||
					(stemKey.length >= 4 && k.startsWith(stemKey) && withoutNumber.startsWith(k));
				if (fits && (!best || k.length > best.length)) best = k;
			}
			return best;
		};

		const stemLabel = stems.map(([, v]) => v.stem).join(' / ');
		const authors = new Set(members.map((m) => authorKeyOf(m.author)));
		const imprints = new Set(members.map((m) => m.imprint).filter((x): x is string => !!x));
		const memberIds = new Set(members.map((m) => m.id));
		// another record of a book already in the series (「響け！ ユーフォニアム 2 …」 next to our
		// 「【TVアニメ化】響け! ユーフォニアム 2 …」): compare titles without a leading 【…】 promo tag
		const titleKey = (t: string) =>
			normalize(
				canonicalizeTitle(
					t
						.normalize('NFKC')
						.replace(/^【[^】]*】\s*/, '')
						.replace(INNER_IMPRINT, ' ')
				)
			);
		const memberTitleKeys = new Set(members.map((m) => titleKey(m.title)));
		const bwSeries = new Set(
			members.map((m) => bwOf(m.title, m.imprint)?.series_id).filter((x): x is number => x != null)
		);

		let results: Result[] = [];
		try {
			const seen = new Set<number>();
			for (const [, { stem }] of stems) {
				for (const r of await search(stem)) {
					if (!seen.has(r.id)) results.push(r);
					seen.add(r.id);
				}
			}
		} catch (e) {
			console.warn(`  ! ${members[0].series_name}: ${(e as Error).message}`);
			return;
		}
		// ---- gap filling: one targeted search per missing volume number ----
		const arcVolumes = new Map<string, Set<number>>(); // arc stemKey -> integer volumes present
		const arcMax = new Map<string, number>(); // highest volume BookWalker knows: sets the range only
		const note = (key: string, v: number | null) => {
			if (v === null || !Number.isInteger(v) || v < 1) return;
			arcVolumes.set(key, (arcVolumes.get(key) ?? new Set()).add(v));
		};
		for (const m of members)
			if (stemKeys.has(m.split.stemKey)) note(m.split.stemKey, m.split.volume);
		for (const r of results) {
			if (!authors.has(authorKeyOf(r.author?.name ?? null))) continue;
			// another imprint (the manga's 1–3) is not this series' volume
			const imp = imprintOfResult(r.title);
			if (imp && imprints.size > 0 && !imprints.has(imp)) {
				const comic = COMIC_IMPRINT.test(imp);
				if (comic !== [...imprints].some((i) => COMIC_IMPRINT.test(i))) continue;
			}
			const sp = splitResult(r.title);
			const arc = arcOf(sp.stemKey, r.title);
			if (arc) note(arc, sp.volume);
		}
		// BookWalker's own volume list for the arc, with titles to search for
		const bwTitles = new Map<string, Map<number, string>>();
		for (const key of stemKeys) {
			const ids = new Set(
				members
					.filter((m) => m.split.stemKey === key)
					.map((m) => bwOf(m.title, m.imprint)?.series_id)
					.filter((x): x is number => x != null)
			);
			const titles = new Map<number, string>();
			for (const id of ids) {
				for (const row of (bwSeriesVolumes?.all(id) ?? []) as { title: string; volume: number }[]) {
					if (Number.isInteger(row.volume) && row.volume >= 1 && !BONUS_TITLE.test(row.title)) {
						titles.set(row.volume, titles.get(row.volume) ?? row.title);
						arcMax.set(key, Math.max(arcMax.get(key) ?? 0, row.volume));
					}
				}
			}
			bwTitles.set(key, titles);
		}
		// the series' imprint as written (「(HJ NOVELS)」): BookWalker titles carry none, and Bookmeter's
		// relevance needs it to surface a volume (「槍使いと、黒猫。5 (HJ NOVELS)」 vs 「…黒猫。5」)
		const imprintText =
			members
				.map(
					(m) =>
						m.title
							.normalize('NFKC')
							.match(/\(([^()]*(?:文庫|ノベル|NOVELS|ブックス|BOOKS|BOX)[^()]*)\)\s*$/i)?.[0]
				)
				.find(Boolean) ?? '';
		const queries: { q: string; n: number; key: string; stem: string }[] = [];
		for (const key of stemKeys) {
			const have = arcVolumes.get(key);
			if (!have || have.size === 0) continue;
			const upTo = Math.max(...have, arcMax.get(key) ?? 0);
			const exemplar = members.find(
				(m) =>
					m.split.stemKey === key && m.split.volume !== null && Number.isInteger(m.split.volume)
			);
			for (let n = 1; n <= upTo; n++) {
				if (have.has(n)) continue;
				const bwTitle = bwTitles.get(key)?.get(n);
				const q = bwTitle
					? `${bwTitle
							.normalize('NFKC')
							.replace(/^【[^】]*】\s*/, '')
							.replace(/\s*[(（][^()（）]*[)）]\s*$/, '')
							.trim()} ${imprintText}`.trim()
					: exemplar
						? swapVolume(exemplar.title, exemplar.split.volume!, n)
						: null;
				if (q) queries.push({ q, n, key, stem: exemplar?.split.stem ?? members[0].split.stem });
			}
		}
		if (process.env.SEQUELS_DEBUG)
			console.log(
				`  ${members[0].series_name}: gap queries`,
				queries.map((x) => x.q)
			);
		// Bookmeter tokenises 「槍使いと、黒猫。 4」 and 「槍使いと、黒猫。4」 differently and finds volume 4
		// only with the space: when a query misses its volume, retry with the space before the number
		// toggled
		const toggleSpace = (q: string) =>
			/\s[0-9]+(?:\.[0-9]+)?(?=\s|\(|$)/.test(q)
				? q.replace(/\s([0-9]+(?:\.[0-9]+)?)(?=\s|\(|$)/, '$1')
				: q.replace(/([^\s0-9])([0-9]+(?:\.[0-9]+)?)(?=\s|\(|$)/, '$1 $2');
		// Variants for a query that misses its volume, in order: as built, then without the imprint
		// (監禁王 8 is filed under ブレイブ文庫, so 「監禁王 8 (オルギスノベル)」 finds nothing), then cut right
		// after the volume number (「Re:ゼロから始める異世界生活Ex5 緋色姫譚 (MF文庫J)」 misses where
		// 「…Ex5」 hits) — each also with the space before the number toggled
		const variantsOf = (q: string, n: number, stem: string) => {
			const noImprint = q.replace(/\s*\([^()]*\)\s*$/, '').trim();
			const at = [...noImprint.matchAll(new RegExp(`(?<![0-9.])${n}(?![0-9.])`, 'g'))].at(-1);
			const short =
				at?.index !== undefined ? noImprint.slice(0, at.index + String(n).length).trim() : null;
			// short first: it hits most often (「マリア様がみてる28」, 「…Ex5」)
			// subtitle first, then the head of the series name: the only form that finds some volumes
			// (「キラキラまわる マリア様」 finds マリア様がみてる 30; 「マリア様がみてる 30」 does not)
			const subtitle =
				at?.index !== undefined ? noImprint.slice(at.index + String(n).length).trim() : '';
			const subtitleFirst = subtitle.length >= 3 ? `${subtitle} ${stem.slice(0, 4)}` : null;
			const base = [short, q, noImprint].filter((x): x is string => !!x && x.length >= 2);
			return [
				...new Set([
					...base.flatMap((x) => [x, toggleSpace(x)]),
					...(subtitleFirst ? [subtitleFirst] : []),
				]),
			];
		};
		const hasVolume = (rs: Result[], key: string, n: number) =>
			rs.some((r) => {
				if (!authors.has(authorKeyOf(r.author?.name ?? null))) return false;
				const sp = splitResult(r.title);
				return arcOf(sp.stemKey, r.title) === key && sp.volume === n;
			});
		// one failing query must not stop the rest
		const seen = new Set(results.map((r) => r.id));
		let used = 0;
		const stillMissing: { n: number; key: string }[] = [];
		for (const { q, n, key, stem } of queries.slice(0, MAX_GAP_VOLUMES)) {
			let hit = false;
			for (const variant of variantsOf(q, n, stem).slice(0, MAX_VARIANTS)) {
				used++;
				try {
					const found = await search(variant, 1);
					for (const r of found) {
						if (!seen.has(r.id)) results.push(r);
						seen.add(r.id);
					}
					if (hasVolume(found, key, n)) {
						hit = true;
						break;
					}
				} catch (e) {
					console.warn(
						`  ! ${members[0].series_name} (gap search 「${variant}」): ${(e as Error).message}`
					);
				}
			}
		}
		gapSearches += used;
		// Author sweep: volumes still missing after the targeted searches — page through the
		// author's books (「今野 緒雪」 lists マリア様がみてる 28–35, which no title query finds)
		for (const { q, n, key } of queries.slice(0, MAX_GAP_VOLUMES)) {
			if (!hasVolume(results, key, n)) stillMissing.push({ n, key });
			void q;
		}
		if (stillMissing.length > 0) {
			const authorName = members
				.map((m) => (m.author ?? '').split(/[,、]/)[0].trim())
				.find(Boolean);
			if (authorName) {
				try {
					for (const r of await search(authorName, AUTHOR_SWEEP_PAGES)) {
						if (!seen.has(r.id)) results.push(r);
						seen.add(r.id);
					}
					authorSweeps++;
				} catch (e) {
					console.warn(`  ! ${members[0].series_name} (author sweep): ${(e as Error).message}`);
				}
			}
		}

		if (++searched % 25 === 0) console.log(`${searched}/${total} series searched…`);

		// published dates of the series' own books, for ordering unnumbered results
		const memberDates = new Map(
			results.filter((r) => memberIds.has(r.id)).map((r) => [r.id, r.published_at])
		);

		for (const r of results) {
			if (
				BONUS_TITLE.test(r.title) ||
				BUNDLE_TITLE.test(r.title) ||
				COMPANION_TITLE.test(r.title) ||
				blacklisted.has(r.id)
			)
				continue;
			const k = known.get(r.id);
			const canonical = k?.canonical ?? r.id;
			if (memberIds.has(canonical) || memberTitleKeys.has(titleKey(r.title))) continue;
			if (k?.series_id != null) continue; // already in a series: the conflict page's territory
			if (excluded.has(`${canonical}:${seriesId}`)) continue;
			if (!authors.has(authorKeyOf(r.author?.name ?? null))) continue;

			const parsed = splitResult(r.title);
			const arc = arcOf(parsed.stemKey, r.title);
			if (!arc) continue;
			// from here on the result is compared within its arc
			const split = { ...parsed, stemKey: arc };
			const imprint = imprintOfResult(r.title);
			// A comics label on a prose series is the manga: drop. Another prose label is kept with a
			// penalty — Bookmeter mislabels some records (モンスターがあふれる世界… 4 is filed as GA文庫 in
			// a GAノベル series), and a same-imprint record of the volume still wins the dedupe below.
			const seriesIsComic = [...imprints].some((i) => COMIC_IMPRINT.test(i));
			const otherImprint = !!imprint && imprints.size > 0 && !imprints.has(imprint);
			if (otherImprint && COMIC_IMPRINT.test(imprint!) !== seriesIsComic) continue;

			const evidence: string[] = [`Bookmeter search 「${stemLabel}」: same author and title stem`];
			let confidence = 0.55;
			if (otherImprint) {
				confidence -= 0.2;
				evidence.push(
					`different imprint (${imprint} vs ${[...imprints].join(', ')}) — mislabelled on Bookmeter, or another edition?`
				);
			} else if (imprint && imprints.has(imprint)) {
				confidence += 0.15;
				evidence.push(`same imprint (${imprint})`);
			} else if (!imprint) {
				evidence.push('imprint unknown');
			}
			const bwMatch = bwOf(r.title, imprint);
			// BookWalker keeps arcs as separate series (1年生編 / 2年生編 / 3年生編): compare against the
			// result's own arc, and say nothing when the arc has no BookWalker match
			const arcBw = new Set(
				members
					.filter((m) => m.split.stemKey === split.stemKey)
					.map((m) => bwOf(m.title, m.imprint)?.series_id)
					.filter((x): x is number => x != null)
			);
			const compareBw = arcBw.size > 0 ? arcBw : bwSeries;
			if (bwMatch && compareBw.has(bwMatch.series_id)) {
				confidence += 0.2;
				evidence.push('BookWalker lists it in the same series as the existing volumes');
			} else if (bwMatch && arcBw.size > 0) {
				confidence -= 0.25;
				evidence.push('BookWalker puts it in a different series');
			}

			// volume: the title, else BookWalker's number for the same book
			let volume = split.volume;
			if (volume === null && stemKeys.has(split.stemKey) && bwMatch?.volume != null) {
				volume = bwMatch.volume;
				evidence.push(`volume ${volume} from BookWalker`);
			}

			const positioned = members.filter((m) => m.position !== null) as (Member & {
				position: number;
			})[];
			// another edition of a volume that is there — within the same arc only: 3年生編5 is not a
			// duplicate of 1年生編's 5
			const duplicate =
				volume !== null &&
				positioned.some(
					(m) =>
						m.split.stemKey === split.stemKey &&
						m.split.volume === volume &&
						(m.split.part ?? 0) === (split.part ?? 0)
				);
			if (duplicate) continue;
			// the series' books carry an imprint and this has none: goods or a companion listing,
			// unless it is a numbered volume
			if (!imprint && imprints.size > 0 && volume === null) continue; // another edition of a volume that is there

			const taken = new Set(positioned.map((m) => m.position));
			let before: (Member & { position: number }) | null = null;
			let after: (Member & { position: number }) | null = null;
			let position: number;
			// Neighbours come from the same arc (same stem): ようこそ's 3年生編5 is placed against
			// 3年生編1–4, not 1年生編's 6. The arc's own offset carries over (3年生編n sit at 300 + n),
			// so a series numbered year*100+n keeps that scheme.
			if (volume !== null) {
				const arc = positioned.filter(
					(m) => m.split.stemKey === split.stemKey && m.split.volume !== null
				);
				before = [...arc].reverse().find((m) => m.split.volume! < volume!) ?? null;
				after = arc.find((m) => m.split.volume! > volume!) ?? null;
				if (!before && !after) {
					// a new arc (4年生編1): after everything
					before = positioned.at(-1) ?? null;
					position = Math.floor(before?.position ?? 0) + 1;
					confidence -= 0.1;
					evidence.push(`volume ${volume} of a part not in the series yet — placed at the end`);
				} else {
					const anchor = before ?? after!;
					const offset = anchor.position - anchor.split.volume!;
					const lo = before?.position ?? 0;
					const hi = after?.position;
					const natural = round2(volume + offset);
					if (natural > lo && (hi === undefined || natural < hi) && !taken.has(natural))
						position = natural;
					else if (hi === undefined) position = Math.floor(lo) + 1;
					else position = round2((lo + hi) / 2);
					confidence += 0.1;
					evidence.push(`volume ${volume} → position ${position}`);
				}
			} else {
				// unnumbered: by publication date among the series' books Bookmeter returned
				const date = r.published_at;
				const dated = positioned.filter((m) => memberDates.get(m.id));
				if (date && dated.length) {
					before = [...dated].reverse().find((m) => memberDates.get(m.id)! <= date) ?? null;
					after = dated.find((m) => memberDates.get(m.id)! > date) ?? null;
					const lo = before?.position ?? 0;
					const hi = after?.position;
					position = hi === undefined ? Math.floor(lo) + 1 : round2((lo + hi) / 2);
					evidence.push(`no volume number — placed by publication date (${date.slice(0, 10)})`);
				} else {
					before = positioned.at(-1) ?? null;
					position = Math.floor(before?.position ?? 0) + 1;
					confidence -= 0.15;
					evidence.push('no volume number or date — placed at the end');
				}
			}
			if (taken.has(position)) continue;

			const fingerprint = `add:${canonical}:${seriesId}`;
			if (decided.has(fingerprint)) continue;
			const inDb = k !== undefined;
			if (!inDb) evidence.push('not in the database yet — imported on apply');
			const toCandidate = (
				m: Member & { position: number }
			): CandidateBook & { position: number } => ({
				id: m.id,
				title: m.title,
				author: m.author ?? '',
				thumbnail_url: m.thumbnail_url,
				read_count: 0,
				volume: m.split.volume,
				part: m.split.part,
				position: m.position,
			});
			const candidate: SequelCandidate = {
				fingerprint,
				confidence: clamp(confidence),
				series: { id: seriesId, name: members[0].series_name, source: 'manual' },
				book: {
					id: canonical,
					title: r.title,
					author: r.author?.name ?? '',
					thumbnail_url: biggerCover(r.image_url),
					read_count: 0,
					volume,
					part: split.part,
				},
				position,
				neighbours: {
					before: before ? toCandidate(before) : null,
					after: after ? toCandidate(after) : null,
				},
				evidence,
				published_at: r.published_at,
				registration_count: r.registration_count,
				...(inDb
					? {}
					: {
							import: {
								title: r.title,
								author: r.author?.name ?? null,
								author_url: r.author?.path ?? null,
								thumbnail_url: biggerCover(r.image_url),
								page: r.page,
							},
						}),
			};
			sequels.push(candidate);
			volumeKey.set(
				candidate,
				volume !== null
					? `${seriesId}|${split.stemKey}|${volume}|${split.part ?? 0}`
					: `${seriesId}|${normalize(canonicalizeTitle(r.title))}`
			);
		}
	};

	// a small pool of workers over the series; each search() call is itself sequential by page
	const queue = [...bySeries];
	await Promise.all(
		Array.from({ length: concurrency }, async () => {
			for (let next = queue.shift(); next; next = queue.shift()) await processSeries(...next);
		})
	);

	// keep the most-registered record of each volume; mention the rest
	const byVolume = new Map<string, SequelCandidate[]>();
	for (const c of sequels)
		byVolume.set(volumeKey.get(c)!, [...(byVolume.get(volumeKey.get(c)!) ?? []), c]);
	const kept = new Set<SequelCandidate>();
	for (const group of byVolume.values()) {
		// a record under the series' own imprint beats a mislabelled one; then the most registered
		const offLabel = (c: SequelCandidate) =>
			c.evidence.some((e) => e.startsWith('different imprint')) ? 1 : 0;
		group.sort(
			(a, b) =>
				offLabel(a) - offLabel(b) ||
				b.registration_count - a.registration_count ||
				a.book.id - b.book.id
		);
		const [best, ...others] = group;
		if (others.length) {
			best.evidence.push(
				`most-registered of ${group.length} records for this volume (${best.registration_count} on Bookmeter; also ${others
					.map((o) => `${o.book.id}: ${o.registration_count}`)
					.join(', ')})`
			);
		}
		kept.add(best);
	}
	sequels.splice(0, sequels.length, ...sequels.filter((c) => kept.has(c)));

	// two results proposing the same slot: only one can be applied
	const slots = new Map<string, SequelCandidate[]>();
	for (const s of sequels)
		slots.set(`${s.series.id}|${s.position}`, [
			...(slots.get(`${s.series.id}|${s.position}`) ?? []),
			s,
		]);
	for (const group of slots.values()) {
		if (group.length < 2) continue;
		for (const s of group) {
			s.confidence = clamp(s.confidence - 0.2);
			s.evidence.push(
				`${group.length - 1} other result(s) propose the same position — approve one, or edit it`
			);
		}
	}

	sequels.sort(
		(a, b) => b.confidence - a.confidence || a.series.id - b.series.id || a.position - b.position
	);
	const result: SequelResult = {
		generated_at: new Date().toISOString(),
		stats: {
			manual_series: total,
			searched,
			bookmeter_requests: requests,
			throttled_retries: retries,
			gap_searches: gapSearches,
			author_sweeps: authorSweeps,
			cache_hits: cacheHits,
			sequels: sequels.length,
			not_in_db: sequels.filter((s) => s.import).length,
		},
		sequels,
	};
	writeFileSync(join(outDir, 'sequels.json'), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result.stats));
	console.log(`-> ${join(outDir, 'sequels.json')}`);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
