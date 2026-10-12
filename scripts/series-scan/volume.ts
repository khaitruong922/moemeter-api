import { canonicalizeTitle, normalize } from '../../src/db/book_merges';

// Title -> series stem + volume, shared by the BookWalker index and the scan so both sides split
// identically. Built on canonicalizeTitle (imprint parens, bonus tags, edition markers and a bare
// "1" are already gone), so "魔女と猟犬 (2) (ガガガ文庫 か 8-12)" arrives as "魔女と猟犬 (2)".

export type VolumeSplit = {
	stem: string; // display form, e.g. "魔女と猟犬"
	stemKey: string; // normalize(stem), the grouping key
	volume: number | null; // null: no number (usually volume 1, or a standalone)
	part: number | null; // 上/前 = 1, 中 = 2, 下/後 = 3 — orders splits within a volume
};

const KANJI_DIGITS: Record<string, number> = {
	一: 1,
	二: 2,
	三: 3,
	四: 4,
	五: 5,
	六: 6,
	七: 7,
	八: 8,
	九: 9,
	壱: 1,
	弐: 2,
	参: 3,
};

// 一..九十九; enough for volume counters
const kanjiToNumber = (s: string): number | null => {
	if (!/^[一二三四五六七八九十壱弐参]+$/.test(s)) return null;
	if (!s.includes('十')) return s.length === 1 ? KANJI_DIGITS[s] : null;
	const [tens, ones] = s.split('十');
	return (tens ? (KANJI_DIGITS[tens] ?? 0) : 1) * 10 + (ones ? (KANJI_DIGITS[ones] ?? 0) : 0);
};

const PART_REGEX = /(?:^|[\s(])([上中下前後])(?:巻|編)?\s*\)?\s*$/;
// also "3 上 subtitle": the split right after the volume number
const LEADING_PART_REGEX = /^\s*([上中下前後])(?:巻|編)?(?=$|[\s)])/;
const partOf = (rest: string): number | null => {
	const m = rest.match(LEADING_PART_REGEX) ?? rest.match(PART_REGEX);
	if (!m) return null;
	return { 上: 1, 前: 1, 中: 2, 下: 3, 後: 3 }[m[1]] ?? null;
};

// "-デルタとガンマの理学部ノート1-" / "~X 3~": the series name and number wrapped at the end, after a
// per-volume title — the stem is the wrapped name, not the text before it
const WRAPPED_REGEX = /[-~]\s*([^-~]{2,}?)\s*([0-9]+(?:\.[0-9]+)?)\s*[-~]\s*$/;

// First volume number after a stem of at least two characters. The number must stand alone:
// not glued to a following letter/digit ("1Q84", "2/3の殺人"), optionally bracketed or counted
// ("(3)", "第3巻", "Vol.3", "Lv.6.5"), and followed by the end, a separator, or a subtitle.
const NUMBERED_REGEX =
	/^(.{2,}?)[\s(\[]*(?:第|その|[Vv]ol\.?\s*|VOL\.?\s*|[Ll][Vv]\.?\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:巻|部|集)?\s*[)\]]?(?=$|[\s:「『~\-(]|[上中下])(.*)$/;

// "新耳袋 第七夜", "屍鬼(一)", "営繕かるかや怪異譚 その弐": kanji-numeral counters
const KANJI_COUNTER_REGEX =
	/^(.{2,}?)[\s(]*(?:第([一二三四五六七八九十]+)[巻夜部話集章]|その([一二三四五六七八九十壱弐参]+)|([一二三四五六七八九十]+))\)?(?=$|[\s:「『~\-])(.*)$/;

export const splitVolume = (rawTitle: string): VolumeSplit => {
	const title = canonicalizeTitle(rawTitle).trim();
	const make = (stem: string, volume: number | null, rest: string): VolumeSplit => {
		const cleaned = stem.replace(/[\s:：\-~(]+$/, '').trim();
		return { stem: cleaned, stemKey: normalize(cleaned), volume, part: partOf(rest) };
	};

	const wrapped = title.match(WRAPPED_REGEX);
	if (wrapped) return make(wrapped[1], Number(wrapped[2]), '');

	const numbered = title.match(NUMBERED_REGEX);
	// The split landed inside a token when the stem ends in a digit or "." ("2033" -> "203" + 3,
	// "2.43" -> "2." + 43) or in letters that follow a digit ("1Q84" -> "1Q" + 84). Letters alone
	// are fine: "Missing2" is Missing volume 2.
	// 1000 and up is part of the title, usually a year: 異世界誕生 2006 / 2007
	if (numbered && !/[0-9.]$|[0-9][A-Za-z]+$/.test(numbered[1]) && Number(numbered[2]) < 1000) {
		return make(numbered[1], Number(numbered[2]), numbered[3]);
	}

	const kanji = title.match(KANJI_COUNTER_REGEX);
	if (kanji) {
		const n = kanjiToNumber(kanji[2] ?? kanji[3] ?? kanji[4]);
		if (n !== null) return make(kanji[1], n, kanji[5]);
	}

	// No number: a trailing 上/下 split still orders the book, and the stem is the rest
	const part = partOf(title);
	const stem = part === null ? title : title.replace(PART_REGEX, '');
	return { ...make(stem, null, ''), part };
};

// The imprint from a Bookmeter title's trailing parens: "(ガガガ文庫 か 8-12)" -> "ガガガ文庫".
// Used to keep a novel and its manga adaptation apart.
export const imprintOf = (rawTitle: string): string | null => {
	const m = rawTitle.normalize('NFKC').match(/\(([^()]+?)(?:\s+[^\s()]*[0-9][^\s()]*)*\)\s*$/);
	if (!m) return null;
	const label = m[1].trim();
	return /文庫|ブックス|ノベル|BOOKS|NOVELS|BOX|コミックス|COMICS|新書/i.test(label)
		? normalizeImprint(label)
		: null;
};

export const normalizeImprint = (label: string): string => normalize(label.split(/\s+/)[0]);

// Bookmeter's convention: every series name ends in "シリーズ"
export const withSeriesSuffix = (name: string): string => {
	const trimmed = name.trim();
	return /シリーズ$/.test(trimmed) ? trimmed : `${trimmed}シリーズ`;
};
