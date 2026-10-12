# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start local dev server at http://localhost:8787 (via wrangler)
npm test           # Run Jest tests (test files live in test/ directory, matched by **/test/**/*.+(ts|tsx))
npm run format     # Prettier format all src/**/*.{ts,js,json}
npm run deploy     # Manual wrangler deploy — NOT the normal path: production deploys on commit + push to main
```

Environment variables are stored as Wrangler secrets (not in `.env`). For local dev, use `.dev.vars` (gitignored).

## Architecture

This is a **Cloudflare Workers** API (runs on the edge, no Node.js runtime) built with **Hono** and **TypeScript**.

### Data flow

1. **Scraping** (`src/scraping/user.ts`) — fetches raw HTML from `bookmeter.com` and parses user stats via regex
2. **Bookmeter API service** (`src/bookmeter-api/`) — calls the sibling `bookmeter-api` Cloudflare Worker (bound as `env.BOOKMETER_API`) to fetch user reads and reviews
3. **Core logic** (`src/core/`) — orchestrates a full user import: fetch reads from the API service, upsert books/reads/reviews into the DB
4. **DB layer** (`src/db/`) — raw SQL via the `postgres` library (tagged template literals). Each file maps to a domain (users, books, reads, reviews, etc.)
5. **Routes** (`src/routes/`) — thin Hono route handlers; one file per resource, mounted in `src/index.ts`

### Database

- **Supabase (PostgreSQL)** via direct connection string (`DATABASE_URL`) using the `postgres` npm package
- Schema is in `schema.sql`; pull latest with `./schema-pull.sh`
- Several leaderboards are **materialized views** (`ranked_users`, `yearly_leaderboard`, `lonely_leaderboard`, `reading_affinity_leaderboard`) that must be explicitly refreshed after data changes — always call the corresponding `refresh*` functions in `src/db/users.ts` after bulk writes
- Supabase client (`src/db/supabase.ts`) is only used for keep-alive pings, not queries

### Scheduled jobs

Four cron triggers in `wrangler.jsonc`, all handled in the `scheduled()` export in `src/index.ts`:
- `0 0,3,6,9,12,15,18,21 * * *` — full sync of all users (descending book count), via `syncAllUsers` from `src/jobs/index.ts`
- `*/3 0,3,6,9,12,15,18,21 * * *` — retry-only sync for users with `sync_status = 'failed'`, via `syncAllUsers`
- `0 1,2,4,5,7,8,10,11,13,14,16,17,19,20,22,23 * * *` — book series sync, via `syncBookSeries` from `src/core/series.ts` (runs hourly, skipping the full-sync hours)
- `0 0 * * *` — Supabase keep-alive query, via `performKeepAliveQuery` from `src/db/supabase.ts` (runs once daily)

### Auth

Protected routes use the `validateGroupAuth` middleware (`src/middlewares/auth.ts`), which requires `group_id` + `password` in the request body verified against the `groups` table.

### Key types

- `AppEnv` (`src/types/app_env.ts`) — Cloudflare Worker bindings: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_KEY`, `DEBUG`, `BOOKMETER_API`
- `BookmeterApiService` (`src/types/bookmeter_api_service.ts`) — interface for the sibling Worker service binding
- Domain models are in `src/db/models.ts`: `User`, `Book`, `Read`, `Review`, `Group`

### Bookcase

Some users have a `bookcase` field — a secondary Bookmeter list that supplements their main read count. When present, `original_books_read` tracks the main count and `books_read` reflects the bookcase total.

## Skills

### merge-books (`.claude/merge-books.md`)

Finds and merges duplicate book entries. Trigger phrases: "find duplicate books", "check books that need merging", "merge duplicate books", "run book merge check".

Detection lives in `selectDuplicateBookCandidates` (`src/db/book_merges.ts`), exposed as `GET /books/duplicate` — it scans the **whole `books` table**, not just books with reads, and combines a normalized title+author key, credit-subset matching, and the SQL prefix rule used by the `syncBookMerges` cron. Run the endpoint first rather than rewriting the normalization by hand; the skill file documents the rules already implemented and the signals already measured and found worthless.

Flow: `GET /books/duplicate` → present the full list → approval → `POST /manual_book_merges` per pair. Never auto-merges (`/manual_book_merges/apply_all` exists but skips review). Requires local dev server (`npm run dev`). To validate a change to the matching rules, score `titleOnlyKey` against the accepted pairs in `final_book_merges` — currently 96.7%.

### series-scan (`.claude/skills/series-scan/SKILL.md`)

Finds missing series: new series among books with no series, and additions to existing series (with a position). Trigger phrases: "scan for series", "find missing series", "run the series scan", or applying a reviewed `decisions.json`.

Scripts in `scripts/series-scan/` (`npm run series:index | series:scan | series:apply`) match books against a local BookWalker index (`../series-scan/bookwalker.sqlite`, built from the BookWalker CSV) and write `review.html` for the user. Flow: index (when the CSV is new) → scan (read-only) → user reviews and exports `decisions.json` → apply (dry run first) through `/manual_series`. Decisions land in `series_scan_decisions` so later scans skip them. Scripts have their own tsconfig (`npx tsc --noEmit -p scripts/series-scan`); the root tsconfig excludes `scripts/`.
