-- Per-series blacklist for Bookmeter memberships: "this book does not belong to this series",
-- e.g. 混物語 (13399813), a crossover collection Bookmeter lists as a volume of 物語シリーズ (4720).
--
-- The sync keeps writing Bookmeter's row; book_series just ignores it. Scoped to one series, so if
-- Bookmeter later moves the book to a different series it shows up there. Manual rows are not
-- affected — a manual membership is already an explicit decision.

BEGIN;

CREATE TABLE public.series_book_exclusions (
    -- canonical (merge base) id, like manual series_books rows
    book_id    integer NOT NULL,
    series_id  integer NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (book_id, series_id)
);

ALTER TABLE public.series_book_exclusions OWNER TO postgres;
ALTER TABLE public.series_book_exclusions ENABLE ROW LEVEL SECURITY;

-- Same output columns, so series_leaderboard (which depends on the view) stays intact
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
    WHERE NOT (
        sb.source = 'bookmeter'
        AND EXISTS (
            SELECT 1 FROM public.series_book_exclusions e
            WHERE e.series_id = sb.series_id
              AND e.book_id = COALESCE(fm.base_id, sb.book_id)
        )
    )
) x
ORDER BY canonical_id, (source = 'manual') DESC, (book_id = canonical_id) DESC, updated_at DESC;

COMMIT;
