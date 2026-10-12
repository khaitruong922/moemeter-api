-- A manual book's predecessor is derived from the current order at reconcile time (inside the
-- series sync, before Bookmeter's new positions are written), so it no longer needs storing. A
-- stored anchor also went stale whenever another book was inserted in front of it.

BEGIN;

-- book_series selected sb.*, which made it depend on every series_books column. Same output
-- columns, so CREATE OR REPLACE keeps series_leaderboard (which depends on the view) intact.
CREATE OR REPLACE VIEW public.book_series AS
SELECT DISTINCT ON (canonical_id)
    canonical_id AS book_id,
    series_id,
    position,
    source
FROM (
    SELECT COALESCE(fm.base_id, sb.book_id) AS canonical_id,
        sb.book_id, sb.source, sb.series_id, sb.position, sb.updated_at
    FROM public.series_books sb
    LEFT JOIN public.final_book_merges fm ON fm.variant_id = sb.book_id
) x
ORDER BY canonical_id, (source = 'manual') DESC, (book_id = canonical_id) DESC, updated_at DESC;

ALTER TABLE public.series_books DROP COLUMN anchor_book_id;

COMMIT;
