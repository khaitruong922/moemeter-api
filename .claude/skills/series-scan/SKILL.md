---
name: series-scan
description: Scan the moemeter database for missing series — new series among books with no series, and books to add to existing series (with a position) — score them, produce review.html for the user to approve/reject, then apply the approved ones. Use when the user asks to "scan for series", "find missing series", "run the series scan", "find books that belong to a series", or to apply a reviewed decisions.json.
---

# series-scan

Finds series the Bookmeter sync never assigned, using the database plus BookWalker's catalogue.
**Generation is code, the user decides.** Never apply anything the user has not approved in
review.html, and never hand-edit candidates into the database.

Design and API reference: `docs/series/README.md` (§4 manual series, §7 scan).

## Files

| What | Where |
|---|---|
| Scripts | `scripts/series-scan/` — `volume.ts` (title → stem + volume), `bw-index.ts`, `scan.ts`, `review.ts`, `apply.ts` |
| BookWalker CSV (input) | `~/Downloads/books_utf8.csv`, the UTF-8 copy of BookWalker's Shift-JIS export |
| Generated (not committed) | `../series-scan/` = `moemeter-project/series-scan/`: `bookwalker.sqlite`, `candidates.json`, `review.html` |
| Decisions | `series_scan_decisions` table, via `GET/POST /manual_series/scan_decisions` |

Run every command from `moemeter-api/`.

## Step 1 — BookWalker index (only when the CSV is new)

Skip if `../series-scan/bookwalker.sqlite` is newer than the CSV. A fresh BookWalker export is
Shift-JIS; convert it first (it looks like mojibake otherwise):

```bash
iconv -f CP932 -t UTF-8 ~/Downloads/books.csv > ~/Downloads/books_utf8.csv
npm run -s series:index -- ~/Downloads/books_utf8.csv ../series-scan/bookwalker.sqlite   # ~15 s
```

The index groups volumes by BookWalker's シリーズ column (`name（imprint）`) and drops 話・連載
episodes, 【購入特典】 bonus stories and non-book categories. To check one book by hand:

```bash
node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('../series-scan/bookwalker.sqlite',{readOnly:true});console.log(db.prepare(\"SELECT s.name,s.label_key,s.volume_count,v.title,v.volume FROM volumes v JOIN series s ON s.id=v.series_id WHERE v.stem_key=? ORDER BY s.id,v.volume\").all(process.argv[1]))" '魔女と猟犬'
```

## Step 2 — Scan (read-only)

```bash
npm run -s series:scan -- ../series-scan/bookwalker.sqlite ../series-scan   # ~4 s
```

Reads the database in one `BEGIN READ ONLY` transaction (`prepare: false` for the transaction
pooler — never use session-level `SET` on port 6543, it leaks onto the shared connection). Prints
stats and writes `candidates.json` + `review.html`. Anything already in `series_scan_decisions`
(approved or rejected) is skipped.

Before handing it over, sanity-check the output yourself: print a few candidates from the top,
middle and bottom of each list from `candidates.json`. Look for parser regressions (fake volumes
from titles like 1Q84 / 2.43 / 86―エイティシックス―Ep.3, half volumes placed at the wrong position)
and fix `volume.ts` / `scan.ts` rather than asking the user to reject them by hand.

## Step 3 — User review

Tell the user to open `../series-scan/review.html` (`open ../series-scan/review.html`):

- tabs **新シリーズ** / **既存シリーズへの追加** (with the position, between its neighbours)
- per card: 承認 / 却下; the new-series name and the addition position are editable. On a
  new-series card every book has a number box (typing re-sorts the card), × drops a book from the
  series, 1から振り直す renumbers 1..n in the current order, 巻数に戻す restores the scan's numbers;
  ⚠ flags duplicate or invalid numbers. The export uses exactly what the card shows. A decided
  card leaves its tab (the next one moves up) and goes to **承認済み** or **却下済み**, newest
  first; clicking its decision there again sends it back
- confidence filter and bulk approve/reject of what is visible (e.g. approve all ≥ 0.9 after a
  skim); choices persist in the browser
- **decisions.json を書き出す** downloads the decisions (usually to `~/Downloads/decisions.json`)

Wait for the user to say they are done. Do not apply a file they have not exported.

Choices are saved per scan run (keyed by `generated_at`), so **re-running the scan starts the page
empty** — never re-scan while the user is mid-review. To change only the page (layout, labels),
rebuild it from the same candidates, which keeps their choices:

```bash
npm run -s series:render -- ../series-scan/candidates.json ../series-scan/review.html
```

## Step 4 — Apply

Dry run first and show the user the counts:

```bash
npm run -s series:apply -- ~/Downloads/decisions.json
npm run -s series:apply -- ~/Downloads/decisions.json --apply            # local API (default)
npm run -s series:apply -- ~/Downloads/decisions.json --apply --api https://moemeter-api.tsuu2092.workers.dev
```

The local API (`npm run dev`) writes to the production database too; either target needs the
deployed code to include the batch `/manual_series` endpoints. Apply creates the approved series
(`POST /manual_series`, names get シリーズ appended), adds the approved books
(`POST /manual_series/books` with the reviewed positions), and records every decision. A failing
entry (a position taken since the scan, a book already in a manual series) is printed, skipped,
and left undecided so the next scan proposes it again. Report created / added / failed counts.

If the writes succeeded but recording the decisions failed, **do not re-run `--apply`** (it would
try to create every series again). Record them alone; approved entries count only if the ledger
(`GET /manual_series`) shows them applied:

```bash
npm run -s series:apply -- ~/Downloads/decisions.json --decisions-only
```

The Worker's DB client runs with `fetch_types: false`, so a JS array passed as one SQL parameter
fails with "malformed array literal". Use `pgIntArray(ids)` (`src/utils/pg.ts`) and cast it:
`${pgIntArray(ids)}::int[]`. A direct Node connection does not reproduce this — test with
`fetch_types: false`.

Undo is per item through the normal endpoints: `POST /manual_series/delete`,
`POST /manual_series/books/delete`, `POST /manual_series/exclusions`.

## How candidates are scored

All scores are clamped to 0.05–0.99. Thresholds were set by inspecting the first run
(2026-10-12: 4,609 books without a series, 3,217 matched in BookWalker → 529 new series, 94
additions).

**Matching a book to BookWalker**: exact `normalize(canonicalizeTitle(title))` first, then
stem + volume. The book's imprint (from its trailing parens, e.g. `(ガガガ文庫 か 8-12)`) must equal
the BookWalker label, which keeps a novel away from its manga adaptation (魔女と猟犬 is both a
ガガガ文庫 and a ガンガンコミックスUP series). An empty BookWalker label counts as unknown, not a
mismatch (the 物語シリーズ novels are grouped as `<物語>` with no label). No imprint → only an
unambiguous match counts. The matched volume's release date is kept to order unnumbered books.

**Additions** — a book with no series that shares author (first credit) + title stem with an
existing series' books (+0.6), or sits in the same BookWalker series (+0.3, or +0.7 on its own).
Position = the volume number when it fits between its neighbours (9 stays 9, 12.5 stays 12.5),
otherwise halfway between them. No volume number → placed by BookWalker release date between the
series' dated members when their dates run in position order (−0.05; 9S memories → 11.5), else
appended (−0.15). Same imprint +0.05, different imprint −0.25. Skipped as duplicate editions
(merge-books cases): a book whose volume number + 上/中/下 is already in the series, or an
unnumbered one whose stem + part is. An unnumbered book whose stem is in the series under another
split (化物語（中） beside 化物語(上)/(下)) gets −0.4. Two candidates proposing the same series +
position both get −0.2 and a note — only one can be applied.

**New series** — books grouped by author + stem and by BookWalker series. Base 0.4; distinct,
mostly numbered volumes +0.15 (+0.05 if consecutive); 3+ books +0.05; ≥2 books in one BookWalker
series +0.3 (name taken from it, 「X」シリーズ unwrapped); clashing volume numbers among numbered
books −0.25; mixed imprints −0.2; stem ≤ 2 characters −0.3. Unnumbered books are ordered by
BookWalker release date. One work split into 上/中/下 (one stem, no numbers: 新世界より, Another)
is dropped — it is a single book, not a series.

New-series **positions keep the volume numbers** (`scripts/series-scan/positions.ts`): 3 and 4 stay
3 and 4 when 1–2 are missing, 7.5 stays 7.5; an unnumbered first book takes 1; 上/中/下 of one
volume step by 0.1 (3, 3.1); the same number twice (another edition) steps by 0.01 (4.5, 4.51).
Only when that is impossible — all unnumbered, an unnumbered book after numbered ones, numbers
running backwards — do they fall back to 1..n. The card shows ⚠ when the series does not start at
1 or two books share a volume number. Apply sends the positions with `POST /manual_series`
(`positions`, one per book).

**Standalone books are not tracked.** An earlier version proposed confidently standalone books
(青空文庫, BookWalker listing no series) and recorded them to keep them out of later scans; it was
dropped — 1,100+ cards to review for no change on the site, and a recorded standalone book could
never be paired with a later sequel. A book with no series evidence is simply not proposed.

## Changing the rules

Re-run the scan and compare `stats` and a sample of candidates before and after. Ideas not yet
measured: co-read sequences, and scoring the generator by hiding series Bookmeter already
assigned and counting how many it rebuilds (the merge-books method).
