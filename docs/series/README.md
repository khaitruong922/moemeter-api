# Series curation

Plan for manual series records, reconciling them with Bookmeter's series sync, and a
Claude-assisted scan for missing series. Status as of 2026-10-12.

| Part | Status |
|---|---|
| [1. Membership table `series_books`](#1-storage-series_books) | ✅ applied, backfilled |
| [1b. Manual series ids from 10^8](#manual-series-ids) | ✅ allocated in code; sequence + check dropped |
| [2. Dual-write from the sync](#2-migration-to-series_books) | ✅ superseded by step 4 (never deployed) |
| [3. Readers move to `book_series`](#2-migration-to-series_books) | ✅ leaderboard rebuilt on live DB 2026-10-12; code not deployed |
| [4. Drop `books.series_id` / `series_number`](#2-migration-to-series_books) | ✅ columns dropped on live DB 2026-10-12; code not deployed |
| [Manual series workflows](#4-manual-workflows) | ⏳ API coded locally (`/manual_series`), not deployed |
| [Reconciliation with Bookmeter](#5-reconciliation-when-bookmeter-catches-up) | planned |
| [Review panel](#6-review-panel) | planned |
| [Claude scan](#7-claude-scan) | ✅ first version: `scripts/series-scan/` + `.claude/skills/series-scan/` |
| [Standalone classification](#8-standalone-books) | ❌ dropped (see §8) |

## Why the current model needs to change

Facts from the code and data that shape the design:

- **`series.id` is Bookmeter's own series id** (1506–11237 today). Manual series use ids
  **from 10^8 upward** so they can never collide (see [Manual series ids](#manual-series-ids)).
- **`series_number` is a position, not a volume number.** `bookmeter-api` assigns
  `books.length + 1` from `series/:id.json?order=asc`. If Bookmeter lacks volume 3, volume 4 is
  numbered 3, and when a missing volume is added every later number shifts. Conflict checks
  must compare **order** (which book comes before), not number equality.
- **The sync overwrites unconditionally.** `updateSeriesIdForBookAndVariants` and
  `bulkUpsertBooks` would erase any manual assignment the moment Bookmeter lists the book.
- **Cleanup jobs delete unread series.** `refreshAll` → `deleteUnreadBooks` and
  `deleteOrphanSeriesAndBooks` would remove a manual series that has no reads yet.
- **Membership is copied onto merge variants**, kept in sync by `propagateSeriesNumbers` /
  `fixOrphanSeriesNumbers`, then undone in every query via `COALESCE(fm.base_id, b.id)` +
  `DISTINCT`. At migration time 7 variants had drifted from their base (see below).

Data size is not a concern: 11,003 books (5 MB), 6,016 in a series, 460 series, 790 merges.
The database as a whole is 345 MB of Supabase's 500 MB free tier, so large reference data
(BookWalker) stays local.

## 1. Storage: `series_books`

Migration: [`migrations/create_series_books.sql`](../../migrations/create_series_books.sql).

```sql
series_books (
  book_id        integer,   -- raw id as written; canonicalized at read time
  source         text,      -- 'bookmeter' | 'manual'
  series_id      integer REFERENCES series(id) ON DELETE CASCADE,
  position       numeric(8,2),   -- Bookmeter position, or manual fractional (4.5, 7.1)
  updated_at     timestamptz,
  PRIMARY KEY (book_id, source)
)

book_series  -- view: one effective row per canonical book
             -- precedence: manual > bookmeter, then base's own row > variant's, then newest
```

Also added: `series.source` (`bookmeter` | `manual`), `series.superseded_by`, and indexes on
`book_merges(base_id)` / `manual_book_merges(base_id)`.

### Manual series ids

Manual series get ids from **100,000,000** (10^8) upward, allocated in code by
`insertManualSeries` (`src/db/series.ts`) — no sequence, no constraint:

```sql
INSERT INTO series (id, name, source)
SELECT GREATEST(MAX(id) + 1, 100000000), $name, 'manual'
FROM series WHERE id >= 100000000
RETURNING id
```

- Bookmeter series ids are ~11k today; they would have to grow ~9,000× to reach 10^8. (Bookmeter
  *book* ids are at ~19M, but series ids are a separate, much slower sequence.)
- Stays within `integer` (max 2,147,483,647), so no type change anywhere. UUIDs were considered
  and rejected: ~100 references across `moemeter-api` and `moemeter` assume a numeric id
  (`Number(c.req.param('seriesId'))`, `isNaN` checks, `number` types).
- Positive, so URLs stay normal (`/series/100000001`), and a 9-digit id reads as manual at a
  glance.
- `MAX + 1` in a single statement is enough with one admin; a concurrent insert that picked the
  same id would fail on the primary key, never duplicate.
- **Collision guard:** `upsertSeries` (used by the Bookmeter sync) only updates rows
  `WHERE series.source = 'bookmeter'`, so a Bookmeter id that ever reached 10^8 cannot rename or
  take over a manual series.

History: a `manual_series_id_seq` sequence (first negative, then from 10^8) and a
`CHECK ((source = 'manual') = (id >= 100000000))` existed briefly and were dropped by
[`migrations/drop_manual_series_id_seq.sql`](../../migrations/drop_manual_series_id_seq.sql). The
check gave little protection: `upsertSeries`' `ON CONFLICT DO UPDATE` path never changes
`source`, so it passed on exactly the clash it was meant to catch.

Why this shape:

- **Each source writes only its own rows**, so a Bookmeter sync cannot overwrite a manual
  decision by construction.
- **No copying onto variants.** The view resolves merges at read time, so merges can happen in
  any order and the propagation functions can be deleted.
- **Conflicts are queries.** A canonical book with both a `manual` and a `bookmeter` row:
  different `series_id` → mismatch; manual row in a manual series → promotion ready; same
  series → confirmed.
- One effective series per book, same as today (`fetchBookSeries` uses `limit=1`). If a book
  ever needs two series, widen the key to `(book_id, source, series_id)`.

### Backfill and the drifted rows

Every `books` row with a `series_id` was copied as a `bookmeter` row, **variants included**.
Of the 7 drifted variants, 6 lacked the series their base had (the view resolves them to the
base) and 1 was the reverse — variant `13391697` (世界最高の暗殺者…) carries series 9491 while
its base `19042215` has none. A base-only backfill would have dropped it.

## 2. Migration to `series_books`

1. ✅ **Create and backfill.** Additive only.
2. ✅ **Dual-write** — coded, never deployed; superseded by step 4, which ships together with
   step 3. Kept here for the record. Wherever the sync sets `books.series_id`, also upsert the matching
   `source = 'bookmeter'` row in `series_books`. Readers still use the old columns, so nothing
   user-visible changes. Run the drift check for a few days of real syncs; it should stay empty.
   Implemented as `mirrorSeriesBooks` (`src/db/series.ts`): called with the touched ids at the
   end of `syncSeriesForBook`, and with no ids (full reconcile, self-healing) as the last step of
   `refreshAll`. It copies `books` → `series_books` bookmeter rows, skips rows whose series is
   missing, deletes bookmeter rows the `books` side no longer has, and never touches manual rows.
   Blacklisting needs no change — `ON DELETE CASCADE` clears its rows.
3. **Move readers to `book_series`**: `series_leaderboard`, `selectSeriesWithReadGaps`,
   `selectBooksForSeriesPage`, `selectUserSeriesProgress`, `selectSeriesLeaderboard` cover,
   `deleteUnreadBooks`, and the series joins in `books.ts` / `book_merges.ts`. Each loses its
   canonical/dedupe CTE.

   Done locally. Notes:
   - `series_leaderboard` is rebuilt by
     [`migrations/series_leaderboard_book_series.sql`](../../migrations/series_leaderboard_book_series.sql).
     **Apply it right after deploying** the dual-write and reader code, not before — until the
     mirror runs in production, `series_books` goes stale and the view would too.
   - `position` is `numeric`, which `postgres.js` returns as a string; every reader casts it
     with `::float8` so the API keeps returning numbers.
   - The book list returns `series_id` / `series_number` from `book_series` (aggregated, since
     the query groups by book).
   - `selectSeriesWithMultipleAuthors` deliberately reads raw `series_books`, not `book_series`:
     9 of its 40 series are flagged only through merge variants credited to someone else —
     mostly manga adaptations (九我山レキ, 川上泰樹, 福田直叶, たかみ裕紀) merged into the novel,
     which may be wrong merges worth reviewing.
   - Variant rows in `getFinalBookMerges` read the variant's own `series_books` row, since
     `book_series` maps a variant onto its base.
   - `deleteOrphanSeriesAndBooks` now skips `source = 'manual'` series and counts reads through
     canonical ids; `deleteUnreadBooks` keeps anything with a `series_books` row.

   Verified against live data (read-only): canonical membership identical (0/0 pairs), new
   `series_leaderboard` identical on all 460 rows and every column, cleanup jobs delete the same
   (0) rows. The only per-book change is the intended one: base `19042215` (世界最高の暗殺者…)
   now shows series 9491 / position 1 instead of nothing. All series and book GET endpoints
   return 200 on the local server.
4. **Stop writing the old columns**, delete `updateSeriesIdForBookAndVariants`,
   `propagateSeriesNumbers`, `fixOrphanSeriesNumbers`, then drop `books.series_id` and
   `books.series_number`.

   Coded locally:
   - `syncSeriesForBook` upserts Bookmeter rows straight into `series_books` via
     `upsertBookmeterSeriesBooks` (raw ids, `position` = Bookmeter's positional number; the
     fetched book gets an unpositioned row if it is missing from the list). Fetch state is still
     marked on the book's merge relatives (`selectBookAndMergeRelatives`).
   - Deleted: `updateSeriesIdForBookAndVariants`, `propagateSeriesNumbers`,
     `fixOrphanSeriesNumbers`, `mirrorSeriesBooks`; `refreshAll` no longer calls them.
   - `bulkUpsertBooks` inserts an explicit column list, so a `Book` object carrying series
     fields cannot reference the dropped columns.
   - `blacklistSeriesIds` only deletes the series; `ON DELETE CASCADE` clears its rows.
   - No database function, trigger, or policy references the columns; the only dependent is
     `series_leaderboard`, rebuilt in step 3.

   Migration: [`migrations/drop_books_series_columns.sql`](../../migrations/drop_books_series_columns.sql),
   no `CASCADE`, so a forgotten dependent aborts it.

   **Applied 2026-10-12, ahead of the deploy, by choice** — in one transaction: a final
   `books` → `series_books` reconcile (0 rows needed), the leaderboard rebuild + refresh (460
   rows, identical to before), then the drop. A fresh snapshot was taken first:
   `backups/series-20261012-110711/`. **Production is broken until the step 3 + 4 code is
   deployed** — the old code reads and writes the dropped columns (user syncs fail in
   `bulkUpsertBooks`, series pages fail). After deploying, run `./schema-pull.sh`.

   The order originally planned:
   1. deploy the step 3 + 4 code
   2. `migrations/series_leaderboard_book_series.sql`
   3. `migrations/drop_books_series_columns.sql` (irreversible)

Every step is reversible until step 4's drop.

## 3. Backup and drift check

Lives outside the repos, in `moemeter-project/backups/` (not committed).

- `series-20261012-103851/books_series.csv` — snapshot of `books.id, series_id, series_number,
  last_series_fetched, title` (6,016 rows) with a `.sha256` checksum, taken right after step 1.
- `check-series-drift.sh [backup_dir]` — diffs the bookmeter rows of `series_books` against the
  newest (or named) backup. Works before and after the column drop. Empty at baseline.

Rows appearing only on the live side are Bookmeter adding books or renumbering — expected over
time. Rows only in the backup are memberships that disappeared and deserve a look. Until the
step 3 + 4 code is deployed, the production sync still writes only `books`, so new series
changes will not reach `series_books` (or this diff) until then.

## 4. Manual workflows

All manual decisions go through API endpoints (never raw SQL, which skips `refreshAll`).
Book ids are resolved to their base via `final_book_merges` before writing.

Implemented in `src/routes/manual_series.ts` + `src/db/manual_series.ts`, mounted at
`/manual_series`. Writes need the bearer token (same as `/manual_book_merges`) and call
`refreshAll`.

| Endpoint | Body | Does |
|---|---|---|
| `GET /manual_series` | — | Ledger: every manual row with `status` — `pending` (Bookmeter has no series for the book), `confirmed` (Bookmeter agrees, or put it in the series this one was superseded by), `conflict` (Bookmeter put it elsewhere) |
| `POST /manual_series` | array (1–200) of `{ name, book_ids }` | New manual series (`insertManualSeries`; `シリーズ` appended when missing), books at positions 1..n in order. One transaction; 409 if a book already has a manual row (error carries the entry `index`) |
| `POST /manual_series/books` | array (1–200) of `{ book_id, series_id, position? }` | Add books to any series. `position` → that exact number (7.1, 8.5; positive, ≤ 2 decimals, 409 if taken); omitted → append (`floor(last) + 1`). Always a batch: applied in order in one transaction — later entries see earlier ones, any failure rolls back the whole batch and the error carries the entry `index`; the response is an array. Moves a book if it already has a manual row elsewhere |
| `POST /manual_series/books/delete` | `{ book_id }` | Remove the book's manual row; Bookmeter's membership (if any) takes effect again |
| `POST /manual_series/delete` | `{ series_id }` | Delete a manual series and its rows. Refuses Bookmeter series |
| `POST /manual_series/rename` | `{ series_id, name }` | Rename a manual series (`シリーズ` appended when missing); refreshes `series_leaderboard` only. Refuses Bookmeter series |
| `POST /manual_series/positions` | `{ series_id, books: [{ book_id, position }] }` | Renumber manual books already in a series (one transaction; 404 if a book has no manual row there, 409 if the result would repeat a position, Bookmeter-placed books included); refreshes `series_leaderboard` (its cover is the first position) |
| `GET` / `POST /manual_series/scan_decisions` | array of `{ fingerprint, kind, decision, book_ids, series_id?, confidence? }` | Series scan review decisions (`new_series` / `add_to_series` / `standalone` × `approved` / `rejected`), so later scans skip them |
| `GET /manual_series/exclusions` | — | Per-series blacklist of Bookmeter memberships |
| `POST /manual_series/exclusions` | `{ book_id, series_id }` | "This Bookmeter volume does not belong to this series" — `book_series` ignores the matching Bookmeter row; the sync can keep writing it. 404 if Bookmeter does not list the book in that series; 409 if the book has a manual row there (delete that instead) |
| `POST /manual_series/exclusions/delete` | `{ book_id, series_id }` | Undo an exclusion |

Responses report `overrides_series_id` when the manual row now overrides a different Bookmeter
series for that book. Errors: 400 bad input, 404
unknown book or series, 409 book already in the series, position taken, series superseded, or
no room left between two positions (two decimals).

Exclusions live in `series_book_exclusions (book_id, series_id)` (canonical ids,
`ON DELETE CASCADE` from `series`; [`migrations/create_series_book_exclusions.sql`](../../migrations/create_series_book_exclusions.sql)).
Scoped to one series, so if Bookmeter later moves the book elsewhere it shows up there. Excluded
volumes leave a gap in positions (24, 26), which is harmless: only the order is used. So far:
`13399813` 混物語 out of `4720` 物語シリーズ (a crossover collection) — the series went from 30 to
29 books and from 0 to 1 completed reader.

Manual series so far: `100000000` デルタとガンマの理学部ノートシリーズ (逆井卓馬, books 22207676 / 22701722 / 23051451 at 1–3).

Example — series 9682 (負けヒロインが多すぎる!), Bookmeter positions 1–8, plus manual
`22027558` SSS at 7.1, `23090751` (8.5) at 8.5 and `23439180` (9) at 9. As one batch:
`[{"book_id":22027558,"series_id":9682,"position":7.1}, {"book_id":23090751,"series_id":9682,"position":8.5}, {"book_id":23439180,"series_id":9682,"position":9}]`

**New series with books** — `POST /manual_series` `{ name, book_ids }`
→ `insertManualSeries` (id ≥ 10^8, `source = 'manual'`), insert `manual` rows into
`series_books`, `refreshAll`.

**Add a book to an existing series** (Bookmeter or manual) — `POST /manual_series/books`
an array of `{ book_id, series_id, position? }`:

- `position` given → that exact number; omitted → `floor(last) + 1`
- an `after_book_id` "halfway to the next book" option existed briefly and was removed in favour
  of explicit positions
- nothing records what a book follows: the reconciler derives each manual book's predecessor
  from the current order, inside the series sync, before Bookmeter's new positions are written,
  and re-places it after that book. (An `anchor_book_id` column existed briefly and was dropped
  by `migrations/drop_series_books_anchor.sql`: a stored anchor went stale whenever another
  book was inserted in front of it.)

`deleteUnreadBooks` and `deleteOrphanSeriesAndBooks` already skip manual memberships and
`source = 'manual'` series (step 3).

## 5. Reconciliation: when Bookmeter catches up

Hook point: `syncSeriesForBook` in `src/core/series.ts`, after fetching the series. Bookmeter
rows are always written; the rules below decide what happens to manual rows.

| Situation | Action | Review |
|---|---|---|
| Manual in Bookmeter series S; Bookmeter now lists it in S, **same predecessor** | Drop/confirm the manual row; Bookmeter's position takes effect. Re-anchor other fractional manual books in S | auto |
| Same, **different predecessor** | Bookmeter position takes effect; log `order_mismatch` | low priority |
| Manual in manual series M; Bookmeter lists it in real series S | **Promotion.** If every Bookmeter-known book of M went to the same S: move M's remaining manual rows to S (keep anchors), set `M.superseded_by = S`, log `promoted`. If they split across series: `promotion_split`, leave M as is | auto if clean |
| Manual in S1; Bookmeter lists it in S2 | Manual row keeps winning (view precedence); log `series_mismatch` | yes |
| Book is `standalone_open`; Bookmeter puts it in a series | Clear the standalone status — the author released more volumes | info |
| Book is `standalone_final`; Bookmeter puts it in a series | Clear it and flag — the rule that called it final was wrong | yes |
| Bookmeter renames a promoted series | Take Bookmeter's name | auto |

Position policy: **manual wins on series, Bookmeter wins on position**, because the rest of
the series is numbered by Bookmeter's positions and mixing schemes breaks ordering.

Conflicts never delete anything and never go through `blacklistSeriesIds` (which deletes rows).
Detection is a query over `series_books`; a small `series_conflicts` table only records
resolutions (`keep_manual` / `take_bookmeter` / `merged`), unique on
`(kind, book_id, bookmeter_series_id)` so a resolved conflict does not reopen each month.

## 6. Review panel

New page `/series-review` in `moemeter`, same pattern as `/book-merges`:

- **Conflicts** — manual vs Bookmeter side by side with covers, positions, and neighbours.
  Keep mine / take Bookmeter / merge into Bookmeter series.
- **Candidates** — Claude's proposals sorted by confidence, with evidence. Accept / edit /
  reject; rejections are stored by fingerprint so they never come back.
- **Ledger** — every manual membership and its state; a manual series is done when every book
  is confirmed by Bookmeter.
- **Standalone** — `standalone_open` books with recheck dates; promote to final.

## 7. Claude scan

> **Built 2026-10-12.** See `.claude/skills/series-scan/SKILL.md` for the runbook and the scoring
> as implemented. Differences from the plan below: the BookWalker index is SQLite via Node's
> built-in `node:sqlite` (not DuckDB), grouped by BookWalker's シリーズ column; candidates are
> reviewed in a generated `review.html` rather than a `series_candidates` table; decisions are
> stored in `series_scan_decisions` (`migrations/create_series_scan_decisions.sql`). Standalone
> books are not tracked (§8). `POST /manual_series` is now
> a batch endpoint (array of `{ name, book_ids }`).

Same principle as `.claude/merge-books.md`: **candidate generation is code; Claude only
judges.** Ad-hoc matching drifts and cannot be measured.

**Stage 0 — BookWalker index (local DuckDB).** Source: `~/Downloads/books_utf8.csv`, converted
from Shift-JIS (CP932); columns タイトル, URL, 配信日, 発行元, レーベル, シリーズ, カテゴリ, 価格;
1,486,384 rows, no author, no Bookmeter id. Drop `話・連載` rows (per-episode webtoon chapters).
Compute stem + volume using the existing `canonicalizeTitle` / `normalize`, not a re-derivation.
Keep it out of Supabase (size).

**Stage 1 — generator** `GET /series/candidates/generate`. Pool: canonical books with no
effective series, not `standalone_final`, not blacklisted; books with reads first.

- Parse title → stem + volume marker (arabic, roman, kanji numerals, 上/中/下, 前/後編,
  第N巻, 7.5)
- same stem + same author, ≥2 books, no series → `new_series`
- stem/author matches an existing series' books or `normalizeSeriesName` → `add_to_series`,
  anchor = the book with the next lower volume
- BookWalker series match → proposed name; more volumes there, or future 配信日 → strong
  "is/will be a series" evidence
- co-read sequences (same users read A then B, same author, similar stems) → supporting
  evidence only
- do not flag spinoffs (外伝/SS/短編集/Ex), anthologies, 分冊 editions — reuse the merge-books
  "Do NOT flag" list

**Stage 2 — judge.** A skill `.claude/series-curation.md` modelled on `merge-books.md`: Claude
reads each cluster with its evidence, decides series / name / order, writes to
`series_candidates` through an endpoint, never to membership. Approval calls the same manual
endpoints as §4, so there is one write path.

```sql
series_candidates (id, kind, fingerprint UNIQUE, payload jsonb, evidence jsonb,
                   confidence real, status, created_at)
-- kind: new_series | add_to_series | standalone_final | standalone_open
```

**Measuring it.** Hide the series Bookmeter already assigned, run the generator, count how
many series it rebuilds in the right order. Do this before adding rules, as merge-books does.

## 8. Standalone books

> **Dropped 2026-10-12.** The scan briefly proposed and recorded standalone books; it was removed
> (`migrations/drop_series_scan_standalone.sql`): 1,100+ cards to review for no change on the site,
> and a recorded standalone book could never be paired with a later sequel. The plan below is kept
> for reference only.

"Not in a series" means two different things:

```sql
book_series_status (book_id PK, status, recheck_after date, reason, decided_by)
-- status: standalone_final | standalone_open
```

- `standalone_final` needs positive evidence: 青空文庫, 完結 in the title, the author's
  bibliography is complete, or BookWalker shows 1 volume released >3 years ago.
- otherwise `standalone_open` with `recheck_after` ≈ 6 months. Cleared automatically by the
  Bookmeter sync or by a BookWalker refresh showing a same-stem volume.
- no evidence either way → no row. Absence means unknown.

## Rollout order

1. ✅ `series_books` + backfill; ✅ manual ids from 10^8 in code; ✅ leaderboard rebuilt and
   old columns dropped on the live DB; ⏳ **deploy the step 3 + 4 code** (production is down
   until then)
2. Protect manual data from the cleanup jobs; manual endpoints; reconciler hook
3. Review panel: Conflicts and Ledger tabs
4. BookWalker index → generator → Claude skill → Candidates tab
5. ~~Standalone classification and recheck job~~ (dropped)

## Operational notes

- `DATABASE_URL` in `.dev.vars` points at the production Supabase database through the
  **transaction pooler** (port 6543). Session-level `SET` statements leak onto the shared server
  connection and persist for the next client — a `SET default_transaction_read_only = on`
  during this work made the first migration attempt fail. Put such settings inside the query's
  own transaction (`BEGIN READ ONLY; … COMMIT;`) instead. The app's `postgres.js` connections
  were not affected.
