// Positions for a proposed new series, from its books in proposed order. Keeps the volume numbers
// themselves (3 and 4 stay 3 and 4 when 1–2 are missing; 7.5 stays 7.5) and only falls back to
// 1..n when they cannot be used:
//   - an unnumbered book at the start takes 1 if it is free (魔女と猟犬, 2, 3, 4 -> 1, 2, 3, 4)
//   - splits of one volume step by 0.1 (3 上, 3 下 -> 3, 3.1)
//   - the same number twice without a 上/中/下 split (MM9 / MM9 invasion, DX.1 / DX.2 read as 1 / 1)
//     means the numbers cannot be trusted -> 1..n; no .01 / .02 nudges. The review page flags it.
//   - all unnumbered, a later unnumbered book, numbers that run backwards, or one number ≥ 10
//     shared by every book (it is part of the title) -> 1..n

type Book = { volume: number | null; part: number | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

export const newSeriesPositions = (books: Book[]): number[] => {
	const sequential = books.map((_, i) => i + 1);
	const firstNumbered = books.findIndex((b) => b.volume !== null);
	if (firstNumbered === -1) return sequential;
	// every book carrying the same number of 10 or more: the number is part of the title, not a
	// volume (世界99 上/下, 字鏡集 20巻 [1]…[13]) — number them by order. Below 10 it is more likely
	// one real volume split in parts (不良聖女の巡礼 3 上 / 3 下 keeps 3, 3.1).
	const first = books[0].volume;
	if (books.length > 1 && first !== null && first >= 10 && books.every((b) => b.volume === first)) {
		return sequential;
	}
	// unnumbered books are only placeable when they all come first, as volume 1
	if (books.slice(firstNumbered).some((b) => b.volume === null)) return sequential;
	if (firstNumbered > 1) return sequential;

	const positions: number[] = [];
	for (const [i, b] of books.entries()) {
		const base = b.volume ?? 1;
		const previous = positions[i - 1];
		const sameVolume = i > 0 && (books[i - 1].volume ?? 1) === base;
		if (sameVolume) {
			// a real 上/中/下 split steps by 0.1; the same number twice otherwise falls back to 1..n
			const prevPart = books[i - 1].part;
			const split = b.part !== null && prevPart !== null && b.part !== prevPart;
			if (!split) return sequential;
			positions.push(round2(previous + 0.1));
		} else {
			positions.push(base);
		}
	}

	const increasing = positions.every((p, i) => p > 0 && (i === 0 || p > positions[i - 1]));
	// a 0.1 step must not run into the next volume (3, 3.1 … 3.9, 4)
	const fits = positions.every((p, i) => i === positions.length - 1 || p < positions[i + 1]);
	return increasing && fits ? positions : sequential;
};
