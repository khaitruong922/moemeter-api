// Series scan: proposes new series and additions to existing series (with a position), scored
// 0..1. Read-only against the database; writes
// candidates.json + review.html for review. See .claude/skills/series-scan/SKILL.md.
//
//   npm run series:scan -- <bookwalker.sqlite> <out dir>
//   npm run series:scan -- - <out dir>          (title and author only, no BookWalker)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import postgres from 'postgres';
import { canonicalizeTitle, normalize } from '../../src/db/book_merges';
import { newSeriesPositions } from './positions';
import { renderReview } from './review';
import { imprintOf, splitVolume, VolumeSplit, withSeriesSuffix } from './volume';

export type Book = {
	id: number;
	title: string;
	author: string;
	thumbnail_url: string | null;
	read_count: number;
};

type BwMatch = {
	series_id: number;
	name: string;
	label_key: string | null;
	category: string;
	volume_count: number;
	last_date: string;
	volumes: { title: string; volume: number | null; date: string }[];
};

type ScannedBook = Book & {
	split: VolumeSplit;
	authorKey: string;
	imprint: string | null;
	bw: BwMatch | null;
	bwDate: string | null; // release date of the matched BookWalker volume — orders unnumbered books
	prefixMatched?: string; // unnumbered, but its title starts with this numbered stem: volume 1
};

export type CandidateBook = Book & { volume: number | null; part: number | null };

export type NewSeriesCandidate = {
	fingerprint: string;
	confidence: number;
	name: string;
	books: (CandidateBook & { position: number })[]; // in proposed order
	evidence: string[];
};

export type AdditionCandidate = {
	fingerprint: string;
	confidence: number;
	series: { id: number; name: string; source: string };
	book: CandidateBook;
	position: number;
	neighbours: {
		before: (CandidateBook & { position: number }) | null;
		after: (CandidateBook & { position: number }) | null;
	};
	evidence: string[];
};

export type ScanResult = {
	generated_at: string;
	stats: Record<string, number>;
	new_series: NewSeriesCandidate[];
	additions: AdditionCandidate[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.max(0.05, Math.min(0.99, round2(n)));

// First credit only: "楓原こうた,へいろー" and "楓原こうた" are the same author for series purposes
const authorKeyOf = (author: string) => normalize((author ?? '').split(/[,、]/)[0]);

const volumeLabel = (s: VolumeSplit) =>
	`${s.volume ?? '—'}${s.part ? ['', '上', '中', '下'][s.part] : ''}`;

const toCandidateBook = (b: ScannedBook): CandidateBook => ({
	id: b.id,
	title: b.title,
	author: b.author,
	thumbnail_url: b.thumbnail_url,
	read_count: b.read_count,
	volume: b.split.volume,
	part: b.split.part,
});

// Sort key within a series: unnumbered counts as volume 1 (first volumes are routinely unnumbered)
const orderKey = (b: { split: VolumeSplit; id: number }) =>
	(b.split.volume ?? 1) * 10 + (b.split.part ?? 0);

const readDatabaseUrl = (): string => {
	const vars = readFileSync('.dev.vars', 'utf8');
	const line = vars.split('\n').find((l) => l.startsWith('DATABASE_URL='));
	if (!line) throw new Error('DATABASE_URL missing from .dev.vars');
	return line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '').trim();
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
	union(a: number, b: number) {
		const ra = this.find(a);
		const rb = this.find(b);
		if (ra !== rb) this.parent.set(rb, ra);
	}
}

const main = async () => {
	const [bwPath, outDir] = process.argv.slice(2);
	if (!bwPath || !outDir) {
		console.error('usage: series:scan <bookwalker.sqlite | -> <out dir>');
		process.exit(1);
	}

	// ---- load (one read-only transaction; prepare:false for the transaction pooler) ----
	const sql = postgres(readDatabaseUrl(), { prepare: false, max: 1 });
	const { pool, members, decided, excluded } = await sql.begin('read only', async (tx) => {
		const pool = await tx<Book[]>`
      SELECT b.id, b.title, b.author, b.thumbnail_url,
             (SELECT count(DISTINCT r.user_id) FROM reads r WHERE r.merged_book_id = b.id)::int AS read_count
      FROM books b
      WHERE b.id NOT IN (SELECT variant_id FROM final_book_merges)
        AND NOT EXISTS (SELECT 1 FROM book_series bs WHERE bs.book_id = b.id)
        AND b.id NOT IN (SELECT id FROM blacklisted_books)
    `;
		const members = await tx<
			(Book & {
				series_id: number;
				series_name: string;
				series_source: string;
				position: number | null;
			})[]
		>`
      SELECT b.id, b.title, b.author, b.thumbnail_url, 0 AS read_count,
             bs.series_id, s.name AS series_name, s.source AS series_source,
             bs.position::float8 AS position
      FROM book_series bs
      JOIN books b ON b.id = bs.book_id
      JOIN series s ON s.id = bs.series_id
    `;
		const decisions = await tx<
			{ fingerprint: string; kind: string; decision: string; book_ids: number[] }[]
		>`
      SELECT fingerprint, kind, decision, book_ids FROM series_scan_decisions
    `;
		const exclusions = await tx<{ book_id: number; series_id: number }[]>`
      SELECT book_id, series_id FROM series_book_exclusions
    `;
		return {
			pool,
			members,
			decided: new Set(decisions.map((d) => d.fingerprint)),
			// "this book does not belong to this series" — never propose it there again
			excluded: new Set(exclusions.map((e) => `${e.book_id}:${e.series_id}`)),
		};
	});
	await sql.end();

	// ---- BookWalker matching ("-" skips it: title and author only) ----
	const noBookWalker = bwPath === '-';
	const bw = new DatabaseSync(noBookWalker ? ':memory:' : bwPath, { readOnly: !noBookWalker });
	if (noBookWalker) {
		bw.exec(`CREATE TABLE volumes (series_id INTEGER, title TEXT, title_key TEXT, stem_key TEXT, volume REAL,
      part INTEGER, date TEXT, label_key TEXT, category TEXT, url TEXT);
      CREATE TABLE series (id INTEGER PRIMARY KEY, raw TEXT, name TEXT, label_key TEXT, category TEXT,
      volume_count INTEGER, first_date TEXT, last_date TEXT);`);
	}
	const byTitle = bw.prepare(
		'SELECT series_id, label_key, category, date FROM volumes WHERE title_key = ?'
	);
	const byStem = bw.prepare(
		`SELECT series_id, label_key, category, date FROM volumes
     WHERE stem_key = ? AND series_id IS NOT NULL AND (volume = ? OR (? IS NULL AND (volume IS NULL OR volume = 1)))`
	);
	const seriesInfo = bw.prepare('SELECT * FROM series WHERE id = ?');
	const seriesVolumes = bw.prepare(
		'SELECT title, volume, date FROM volumes WHERE series_id = ? ORDER BY coalesce(volume, 1), date'
	);
	const seriesCache = new Map<number, BwMatch>();
	const loadSeries = (id: number): BwMatch => {
		const cached = seriesCache.get(id);
		if (cached) return cached;
		const s = seriesInfo.get(id) as Record<string, string | number>;
		const match: BwMatch = {
			series_id: id,
			name: String(s.name),
			label_key: (s.label_key as string) ?? null,
			category: String(s.category),
			volume_count: Number(s.volume_count),
			last_date: String(s.last_date),
			volumes: seriesVolumes.all(id).map((v) => ({
				title: String(v.title),
				volume: v.volume === null ? null : Number(v.volume),
				date: String(v.date),
			})),
		};
		seriesCache.set(id, match);
		return match;
	};

	type Row = { series_id: number | null; label_key: string | null; category: string; date: string };
	// Pick one BookWalker series for a book: same imprint wins; otherwise only an unambiguous match
	const pickSeries = (rows: Row[], imprint: string | null): number | null => {
		const withSeries = rows.filter((r) => r.series_id !== null);
		const ids = [...new Set(withSeries.map((r) => r.series_id as number))];
		if (ids.length === 0) return null;
		if (imprint) {
			const sameLabel = [
				...new Set(
					// an empty BookWalker label (e.g. the <物語> series) is unknown, not a mismatch
					withSeries
						.filter((r) => r.label_key === imprint || !r.label_key)
						.map((r) => r.series_id as number)
				),
			];
			if (sameLabel.length === 1) return sameLabel[0];
			if (sameLabel.length > 1) return null;
			// the book names an imprint BookWalker never uses for this title: a different edition
			// (often the manga when the book is the novel) — not evidence
			return null;
		}
		return ids.length === 1 ? ids[0] : null;
	};

	const scan = (b: Book): ScannedBook => {
		const split = splitVolume(b.title);
		const imprint = imprintOf(b.title);
		const titleKey = normalize(canonicalizeTitle(b.title));
		const exact = byTitle.all(titleKey) as Row[];
		let seriesId = pickSeries(exact, imprint);
		if (seriesId === null && split.stemKey.length >= 2) {
			seriesId = pickSeries(
				byStem.all(split.stemKey, split.volume, split.volume) as Row[],
				imprint
			);
		}
		let bwDate: string | null = null;
		if (seriesId !== null) {
			const rows = [...exact, ...(byStem.all(split.stemKey, split.volume, split.volume) as Row[])];
			const dates = rows
				.filter((r) => r.series_id === seriesId)
				.map((r) => r.date)
				.sort();
			bwDate = dates[0] ?? null;
		}
		return {
			...b,
			split,
			authorKey: authorKeyOf(b.author),
			imprint,
			bw: seriesId === null ? null : loadSeries(seriesId),
			bwDate,
		};
	};

	const poolBooks = pool.map(scan);
	const scannedMembers = members.map((m) => ({ m, s: { ...scan(m), position: m.position } }));

	// Unnumbered first volumes with a subtitle ("うしろの席の…しまった。 もう俺は…" next to
	// "…しまった。2 …") get a different stem from the numbered ones. Re-key an unnumbered book to the
	// longest numbered stem by the same author that its own stem starts with (≥ 5 characters), and
	// treat it as volume 1. Only numbered stems anchor, so unrelated titles sharing a prefix stay apart.
	const numberedStems = new Map<string, Map<string, string>>(); // authorKey -> stemKey -> stem
	for (const b of [...poolBooks, ...scannedMembers.map((x) => x.s)]) {
		if (b.split.volume === null || b.split.stemKey.length < 5) continue;
		const byAuthor = numberedStems.get(b.authorKey) ?? new Map<string, string>();
		byAuthor.set(b.split.stemKey, b.split.stem);
		numberedStems.set(b.authorKey, byAuthor);
	}
	const rekey = (b: ScannedBook) => {
		if (b.split.volume !== null) return;
		const own = b.split.stemKey;
		let best: [string, string] | null = null;
		for (const [key, stem] of numberedStems.get(b.authorKey) ?? []) {
			if (key !== own && own.startsWith(key) && (!best || key.length > best[0].length))
				best = [key, stem];
		}
		if (!best) return;
		b.prefixMatched = best[1];
		b.split = { ...b.split, stem: best[1], stemKey: best[0], volume: 1 };
	};
	poolBooks.forEach(rekey);
	scannedMembers.forEach((x) => rekey(x.s));

	// ---- existing series: stems, authors, BookWalker series of their members ----
	type SeriesEntry = {
		id: number;
		name: string;
		source: string;
		members: (ScannedBook & { position: number | null })[];
		stems: Set<string>; // authorKey|stemKey
		bwIds: Set<number>;
		authors: Set<string>;
	};
	const seriesById = new Map<number, SeriesEntry>();
	for (const { m, s: scannedMember } of scannedMembers) {
		let entry = seriesById.get(m.series_id);
		if (!entry) {
			entry = {
				id: m.series_id,
				name: m.series_name,
				source: m.series_source,
				members: [],
				stems: new Set(),
				bwIds: new Set(),
				authors: new Set(),
			};
			seriesById.set(m.series_id, entry);
		}
		const scanned = scannedMember;
		entry.members.push(scanned);
		entry.authors.add(scanned.authorKey);
		if (scanned.split.stemKey.length >= 2)
			entry.stems.add(`${scanned.authorKey}|${scanned.split.stemKey}`);
		if (scanned.bw) entry.bwIds.add(scanned.bw.series_id);
	}
	const seriesByStem = new Map<string, SeriesEntry[]>();
	const seriesByBw = new Map<number, SeriesEntry[]>();
	for (const s of seriesById.values()) {
		s.members.sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));
		for (const k of s.stems) seriesByStem.set(k, [...(seriesByStem.get(k) ?? []), s]);
		for (const k of s.bwIds) seriesByBw.set(k, [...(seriesByBw.get(k) ?? []), s]);
	}

	// ---- additions ----
	const additions: AdditionCandidate[] = [];
	const usedInAddition = new Set<number>();
	for (const b of poolBooks) {
		const stemMatches =
			b.split.stemKey.length >= 2
				? (seriesByStem.get(`${b.authorKey}|${b.split.stemKey}`) ?? [])
				: [];
		const bwMatches = b.bw
			? (seriesByBw.get(b.bw.series_id) ?? []).filter((s) => s.authors.has(b.authorKey))
			: [];
		const targets = [...new Set([...stemMatches, ...bwMatches])];
		if (targets.length !== 1) continue; // none, or ambiguous between series
		const s = targets[0];
		if (excluded.has(`${b.id}:${s.id}`)) continue;
		const viaStem = stemMatches.includes(s);
		const viaBw = bwMatches.includes(s);

		const positioned = s.members.filter((m) => m.position !== null) as (ScannedBook & {
			position: number;
		})[];
		const v = b.split.volume;
		const key = orderKey(b);
		// Same volume already in the series: a duplicate edition, a merge-books case, not an addition.
		// Numbered: same volume and part. Unnumbered: same stem and part (化物語（上） vs 化物語(上)).
		const duplicate = positioned.some((m) =>
			v !== null
				? m.split.volume === v && (m.split.part ?? 0) === (b.split.part ?? 0)
				: m.split.volume === null &&
					m.split.stemKey === b.split.stemKey &&
					(m.split.part ?? 0) === (b.split.part ?? 0)
		);
		if (duplicate) continue;
		// Unnumbered and its title is already in the series under another split (化物語（中） next to
		// 化物語(上)/(下)): another edition of a book that is there, more likely a merge than an addition
		const sameTitleInSeries =
			v === null &&
			positioned.some((m) => m.split.volume === null && m.split.stemKey === b.split.stemKey);

		const evidence: string[] = [];
		let confidence = 0;
		if (viaStem) {
			confidence += 0.6;
			evidence.push(`same author and title stem 「${b.split.stem}」 as the series' books`);
		}
		if (b.prefixMatched) {
			evidence.push(
				`no number, but the title starts with 「${b.prefixMatched}」 — read as volume 1`
			);
		}
		if (viaBw) {
			confidence += viaStem ? 0.3 : 0.7;
			evidence.push(`BookWalker lists it in 「${b.bw!.name}」 together with this series' books`);
		}

		let before: (ScannedBook & { position: number }) | null = null;
		let after: (ScannedBook & { position: number }) | null = null;
		let position: number;
		// No number: place by BookWalker release date among the dated members, when their dates run
		// in the same order as their positions (化物語 → 傷物語 → 偽物語…); otherwise append
		const dated = positioned.filter((m) => m.bwDate !== null);
		const datesInOrder = dated.every((m, i) => i === 0 || dated[i - 1].bwDate! <= m.bwDate!);
		if (v === null && b.bwDate && dated.length > 0 && datesInOrder) {
			before = [...dated].reverse().find((m) => m.bwDate! <= b.bwDate!) ?? null;
			after = dated.find((m) => m.bwDate! > b.bwDate!) ?? null;
			const lo = before?.position ?? 0;
			const hi = after?.position;
			position = hi === undefined ? Math.floor(lo) + 1 : round2((lo + hi) / 2);
			const taken = new Set(positioned.map((m) => m.position));
			if (position <= lo || (hi !== undefined && position >= hi) || taken.has(position)) continue;
			confidence -= 0.05;
			evidence.push(
				`no volume number — placed by BookWalker release date (${b.bwDate}) → position ${position}`
			);
		} else if (v === null) {
			before = positioned.at(-1) ?? null;
			position = Math.floor(before?.position ?? 0) + 1;
			confidence -= 0.15;
			evidence.push('no volume number in the title — placed at the end');
		} else {
			const numbered = positioned.filter((m) => m.split.volume !== null || m === positioned[0]);
			before = [...numbered].reverse().find((m) => orderKey(m) < key) ?? null;
			after = numbered.find((m) => orderKey(m) > key) ?? null;
			const lo = before?.position ?? 0;
			const hi = after?.position;
			// Prefer the volume number itself when it fits the gap (keeps 9 as 9 and 12.5 as 12.5)
			const taken = new Set(positioned.map((m) => m.position));
			if (v > lo && (hi === undefined || v < hi) && !taken.has(v) && round2(v) === v) position = v;
			else if (hi === undefined) position = Math.floor(lo) + 1;
			else position = round2((lo + hi) / 2);
			if (position <= lo || (hi !== undefined && position >= hi) || taken.has(position)) continue;
			confidence += 0.05;
			evidence.push(`volume ${volumeLabel(b.split)} → position ${position}`);
		}
		const memberImprints = new Set(s.members.map((m) => m.imprint).filter(Boolean));
		if (b.imprint && memberImprints.has(b.imprint)) {
			confidence += 0.05;
			evidence.push(`same imprint (${b.imprint})`);
		} else if (b.imprint && memberImprints.size > 0) {
			confidence -= 0.25;
			evidence.push(
				`different imprint (${b.imprint} vs ${[...memberImprints].join(', ')}) — another edition or adaptation?`
			);
		}
		if (sameTitleInSeries) {
			confidence -= 0.4;
			evidence.push(
				`「${b.split.stem}」 is already in this series — another edition? (merge instead)`
			);
		}
		const fingerprint = `add:${b.id}:${s.id}`;
		if (decided.has(fingerprint)) continue;
		usedInAddition.add(b.id);
		additions.push({
			fingerprint,
			confidence: clamp(confidence),
			series: { id: s.id, name: s.name, source: s.source },
			book: toCandidateBook(b),
			position,
			neighbours: {
				before: before ? { ...toCandidateBook(before), position: before.position } : null,
				after: after ? { ...toCandidateBook(after), position: after.position } : null,
			},
			evidence,
		});
	}

	// ---- new series ----
	const remaining = poolBooks.filter((b) => !usedInAddition.has(b.id));
	const uf = new UnionFind();
	const firstByKey = new Map<string, number>();
	const link = (key: string, id: number) => {
		const first = firstByKey.get(key);
		if (first === undefined) firstByKey.set(key, id);
		else uf.union(first, id);
	};
	for (const b of remaining) {
		if (b.split.stemKey.length >= 2 && (b.split.volume !== null || b.split.part !== null || true)) {
			link(`stem:${b.authorKey}|${b.split.stemKey}`, b.id);
		}
		if (b.bw) link(`bw:${b.authorKey}|${b.bw.series_id}`, b.id);
	}
	const clusters = new Map<number, ScannedBook[]>();
	for (const b of remaining) {
		const root = uf.find(b.id);
		clusters.set(root, [...(clusters.get(root) ?? []), b]);
	}

	const newSeries: NewSeriesCandidate[] = [];
	const inNewSeries = new Set<number>();
	for (const books of clusters.values()) {
		if (books.length < 2) continue;
		// equal keys are usually unnumbered books (化物語, 偽物語…): order them by release date
		books.sort(
			(a, b) =>
				orderKey(a) - orderKey(b) ||
				(a.bwDate ?? '9999').localeCompare(b.bwDate ?? '9999') ||
				a.id - b.id
		);
		const stems = new Set(books.map((b) => b.split.stemKey));
		const prefixed = books.filter((b) => b.prefixMatched);
		// One work split into 上/中/下 (新世界より, かがみの孤城, Another), often alongside its one-volume
		// edition: a single book, not a series — and the unsplit edition is a merge-books case
		if (
			stems.size === 1 &&
			books.every((b) => b.split.volume === null) &&
			books.some((b) => b.split.part !== null)
		) {
			continue;
		}
		const evidence: string[] = [];
		let confidence = 0.4;
		if (prefixed.length) {
			evidence.push(
				`${prefixed.map((b) => b.title.slice(0, 20)).join(', ')}: no number, title starts with 「${prefixed[0].prefixMatched}」 — read as volume 1`
			);
		}
		evidence.push(
			`${books.length} books by ${books[0].author}${stems.size === 1 ? ` sharing the stem 「${books[0].split.stem}」` : ''}`
		);

		// clashing numbers only count among numbered books — unnumbered ones all share key 10
		const numberedBooks = books.filter((b) => b.split.volume !== null);
		const numbered = numberedBooks.length;
		const numberedKeys = numberedBooks.map((b) => orderKey(b));
		const distinct = new Set(numberedKeys).size === numberedKeys.length;
		if (!distinct) {
			confidence -= 0.25;
			evidence.push('two books share a volume number — duplicates or different editions?');
		} else if (numbered >= books.length - 1) {
			confidence += 0.15;
			evidence.push(`volumes ${books.map((b) => volumeLabel(b.split)).join(', ')}`);
			const ints = books.map((b) => b.split.volume ?? 1);
			if (ints.every((n, i) => i === 0 || n - ints[i - 1] <= 1)) confidence += 0.05;
		} else if (books.every((b) => b.bwDate)) {
			evidence.push(
				`unnumbered — ordered by BookWalker release date (${books[0].bwDate} … ${books.at(-1)!.bwDate})`
			);
		} else {
			evidence.push('mostly unnumbered titles');
		}
		if (books.length >= 3) confidence += 0.05;

		const bwIds = books.map((b) => b.bw?.series_id).filter((x): x is number => x !== undefined);
		const bwMain = bwIds.length >= 2 ? [...new Set(bwIds)] : [];
		let bwSeries: BwMatch | null = null;
		if (bwMain.length === 1) {
			bwSeries = loadSeries(bwMain[0]);
			confidence += 0.3;
			const ours = books.length;
			evidence.push(
				`BookWalker series 「${bwSeries.name}」 (${bwSeries.label_key ?? '?'}): ${bwSeries.volume_count} volumes, latest ${bwSeries.last_date}${bwSeries.volume_count > ours ? ` — ${bwSeries.volume_count - ours} not in the database yet` : ''}`
			);
		} else if (bwMain.length > 1) {
			confidence -= 0.1;
			evidence.push('books map to different BookWalker series');
		}
		const imprints = new Set(books.map((b) => b.imprint).filter(Boolean));
		if (imprints.size > 1) {
			confidence -= 0.2;
			evidence.push(`mixed imprints: ${[...imprints].join(', ')}`);
		}
		if (books[0].split.stemKey.length <= 2) {
			confidence -= 0.3;
			evidence.push('very short title stem');
		}

		const ids = books.map((b) => b.id).sort((a, b) => a - b);
		const fingerprint = `new:${ids.join(',')}`;
		if (decided.has(fingerprint)) continue;
		books.forEach((b) => inNewSeries.add(b.id));
		newSeries.push({
			fingerprint,
			confidence: clamp(confidence),
			// BookWalker often writes 「不良聖女の巡礼」シリーズ; keep the bare name, then add シリーズ
			name: withSeriesSuffix(
				(bwSeries?.name ?? books[0].split.stem)
					.normalize('NFKC')
					.replace(/^「(.+)」(シリーズ)?$/, '$1')
			),
			books: (() => {
				const candidateBooks = books.map(toCandidateBook);
				const positions = newSeriesPositions(candidateBooks);
				return candidateBooks.map((b, i) => ({ ...b, position: positions[i] }));
			})(),
			evidence,
		});
	}

	// Two candidates proposing the same slot: only one can be applied (the second would get a 409)
	const slots = new Map<string, AdditionCandidate[]>();
	for (const a of additions) {
		const key = `${a.series.id}|${a.position}`;
		slots.set(key, [...(slots.get(key) ?? []), a]);
	}
	for (const group of slots.values()) {
		if (group.length < 2) continue;
		for (const a of group) {
			a.confidence = clamp(a.confidence - 0.2);
			a.evidence.push(
				`${group.length - 1} other candidate(s) propose the same position — approve one, or edit the position`
			);
		}
	}

	const byConfidence = <T extends { confidence: number }>(a: T, b: T) =>
		b.confidence - a.confidence;
	const result: ScanResult = {
		generated_at: new Date().toISOString(),
		stats: {
			pool: pool.length,
			previously_decided: decided.size,
			bookwalker_matched: poolBooks.filter((b) => b.bw).length,
			new_series: newSeries.length,
			new_series_books: inNewSeries.size,
			additions: additions.length,
		},
		new_series: newSeries.sort(byConfidence),
		additions: additions.sort(byConfidence),
	};

	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, 'candidates.json'), JSON.stringify(result, null, 2));
	writeFileSync(join(outDir, 'review.html'), renderReview(result));
	console.log(JSON.stringify(result.stats));
	console.log(`-> ${join(outDir, 'review.html')}`);
};

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
