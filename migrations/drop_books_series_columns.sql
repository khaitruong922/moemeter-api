-- Step 4 of the move to series_books (docs/series/README.md §2): drop the old membership
-- columns. Irreversible; backups/series-*/books_series.csv holds the last values.
--
-- Order on deploy day:
--   1. deploy the code that reads book_series and writes series_books only
--   2. migrations/series_leaderboard_book_series.sql (the old view depends on books.series_id,
--      so without it this migration fails instead of silently cascading)
--   3. this file

BEGIN;

-- No CASCADE on purpose: anything still depending on these columns aborts the migration
ALTER TABLE public.books
    DROP COLUMN series_id,
    DROP COLUMN series_number;

COMMIT;
