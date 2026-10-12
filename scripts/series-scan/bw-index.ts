// BookWalker catalog CSV -> SQLite index grouped by series, so "which series is this book in, and
// what else is in it?" is one indexed lookup. Rebuild whenever a newer CSV is downloaded.
//
//   npm run series:index -- <books_utf8.csv> <out.sqlite>
//
// The CSV is the UTF-8 conversion of BookWalker's Shift-JIS export: タイトル, URL, 配信日, 発行元,
// レーベル, シリーズ, カテゴリ, 価格. It has no author and no Bookmeter id, so matching is by title;
// the シリーズ column ("name（label）") is BookWalker's own grouping and is the strongest signal.

import { createReadStream, existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { canonicalizeTitle, normalize } from '../../src/db/book_merges';
import { normalizeImprint, splitVolume } from './volume';

// Per-episode webtoon/serial chapters and non-book items: never a Bookmeter volume
const SKIPPED_CATEGORY = /^話・連載|^(写真集|画集|きせかえ本棚|ゲーム|ヨミ―！ポイント)$/;
// Bonus short stories share the volume's title ("【購入特典】『…理学部ノート4-』…ショートストーリー")
const BONUS_TITLE = /購入特典|特典SS|限定書き下ろし|ショートストーリー$/;

// The file is fully quoted, one record per line (no embedded newlines)
const parseLine = (line: string): string[] => {
	const fields: string[] = [];
	let i = 0;
	while (i <= line.length) {
		if (line[i] === '"') {
			let value = '';
			i++;
			for (;;) {
				const q = line.indexOf('"', i);
				if (q === -1) throw new Error(`unterminated quote: ${line.slice(0, 80)}`);
				value += line.slice(i, q);
				if (line[q + 1] === '"') {
					value += '"';
					i = q + 2;
				} else {
					i = q + 1;
					break;
				}
			}
			fields.push(value);
			i++; // comma
		} else {
			const comma = line.indexOf(',', i);
			const end = comma === -1 ? line.length : comma;
			fields.push(line.slice(i, end));
			i = end + 1;
		}
	}
	return fields;
};

const main = async () => {
	const [csvPath, outPath] = process.argv.slice(2);
	if (!csvPath || !outPath) {
		console.error('usage: series:index <books_utf8.csv> <out.sqlite>');
		process.exit(1);
	}
	const tmpPath = `${outPath}.tmp`;
	if (existsSync(tmpPath)) rmSync(tmpPath);
	const db = new DatabaseSync(tmpPath);
	db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE series (
      id INTEGER PRIMARY KEY,
      raw TEXT UNIQUE,          -- the シリーズ column as written: "name（label）"
      name TEXT,                -- without the trailing （label）
      label_key TEXT,
      category TEXT,
      volume_count INTEGER,
      first_date TEXT,
      last_date TEXT
    );
    CREATE TABLE volumes (
      series_id INTEGER,        -- NULL: BookWalker lists the title with no series
      title TEXT,
      title_key TEXT,           -- normalize(canonicalizeTitle(title)), same as the merge key
      stem_key TEXT,
      volume REAL,
      part INTEGER,
      date TEXT,                -- YYYY/MM/DD
      label_key TEXT,
      category TEXT,
      url TEXT
    );
  `);

	const insertSeries = db.prepare(
		'INSERT INTO series (raw, name, label_key, category) VALUES (?, ?, ?, ?) RETURNING id'
	);
	const insertVolume = db.prepare('INSERT INTO volumes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
	const seriesIds = new Map<string, number>();

	const lines = createInterface({ input: createReadStream(csvPath, 'utf8'), crlfDelay: Infinity });
	let header = true;
	let kept = 0;
	let skipped = 0;
	const started = Date.now();
	db.exec('BEGIN');
	for await (const line of lines) {
		if (header) {
			header = false;
			continue;
		}
		const [title, url, date, , label, seriesRaw, category] = parseLine(line);
		if (SKIPPED_CATEGORY.test(category) || BONUS_TITLE.test(title)) {
			skipped++;
			continue;
		}
		const labelKey = label ? normalizeImprint(label) : null;
		let seriesId: number | null = null;
		if (seriesRaw) {
			seriesId = seriesIds.get(seriesRaw) ?? null;
			if (seriesId === null) {
				const name = seriesRaw.replace(/（[^（）]*）$/, '').trim();
				seriesId = Number(
					(insertSeries.get(seriesRaw, name, labelKey, category) as { id: number }).id
				);
				seriesIds.set(seriesRaw, seriesId);
			}
		}
		const split = splitVolume(title);
		insertVolume.run(
			seriesId,
			title,
			normalize(canonicalizeTitle(title)),
			split.stemKey,
			split.volume,
			split.part,
			date,
			labelKey,
			category,
			url
		);
		if (++kept % 200_000 === 0) console.log(`${kept} rows…`);
	}
	db.exec('COMMIT');

	console.log('indexing…');
	db.exec(`
    CREATE INDEX volumes_title_key ON volumes (title_key);
    CREATE INDEX volumes_stem ON volumes (stem_key, volume);
    CREATE INDEX volumes_series ON volumes (series_id);
    UPDATE series SET
      volume_count = (SELECT count(*) FROM volumes v WHERE v.series_id = series.id),
      first_date = (SELECT min(date) FROM volumes v WHERE v.series_id = series.id),
      last_date = (SELECT max(date) FROM volumes v WHERE v.series_id = series.id);
    ANALYZE;
  `);
	const seriesCount = (db.prepare('SELECT count(*) AS n FROM series').get() as { n: number }).n;
	db.close();
	if (existsSync(outPath)) rmSync(outPath);
	const { renameSync } = await import('node:fs');
	renameSync(tmpPath, outPath);
	console.log(
		`${kept} volumes in ${seriesCount} series (${skipped} skipped) -> ${outPath} in ${((Date.now() - started) / 1000).toFixed(0)}s`
	);
};

main();
