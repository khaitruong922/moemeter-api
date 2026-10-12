-- Series membership moves out of books.series_id / books.series_number into series_books.
--
-- Each source writes only its own rows, so a Bookmeter sync can never overwrite a manual
-- assignment. Rows hold raw book ids; book_series canonicalizes through final_book_merges at
-- read time, so membership no longer has to be copied onto merge variants.
--
-- Additive only: books.series_id / books.series_number stay in place until every reader has
-- moved to book_series.

BEGIN;

CREATE TABLE public.series_books (
    book_id        integer NOT NULL,
    source         text    NOT NULL CHECK (source IN ('bookmeter', 'manual')),
    series_id      integer NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
    -- Bookmeter's positional number, or a manual fractional one (4.5 = between 4 and 5)
    position       numeric(8,2),
    -- Manual only: the book this one is placed after, used to re-check order after a resync
    anchor_book_id integer,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (book_id, source)
);

CREATE INDEX idx_series_books_series_position ON public.series_books (series_id, position);

ALTER TABLE public.series_books OWNER TO postgres;
ALTER TABLE public.series_books ENABLE ROW LEVEL SECURITY;

-- Manual series ids (>= 10^8) are allocated in code: insertManualSeries in src/db/series.ts
ALTER TABLE public.series
    ADD COLUMN source text NOT NULL DEFAULT 'bookmeter' CHECK (source IN ('bookmeter', 'manual')),
    ADD COLUMN superseded_by integer REFERENCES public.series(id);

-- Effective membership, one row per canonical book: manual beats Bookmeter, then the base's own
-- row beats a variant's, then the newest row.
CREATE VIEW public.book_series AS
SELECT DISTINCT ON (canonical_id)
    canonical_id AS book_id,
    series_id,
    position,
    source
FROM (
    SELECT COALESCE(fm.base_id, sb.book_id) AS canonical_id, sb.*
    FROM public.series_books sb
    LEFT JOIN public.final_book_merges fm ON fm.variant_id = sb.book_id
) x
ORDER BY canonical_id, (source = 'manual') DESC, (book_id = canonical_id) DESC, updated_at DESC;

ALTER VIEW public.book_series OWNER TO postgres;

-- Reverse lookups (variants of a base) had no index
CREATE INDEX IF NOT EXISTS idx_book_merges_base_id ON public.book_merges (base_id);
CREATE INDEX IF NOT EXISTS idx_manual_book_merges_base_id ON public.manual_book_merges (base_id);

-- Backfill every row, variants included: one variant (13391697) carries a series its base lacks
INSERT INTO public.series_books (book_id, source, series_id, position)
SELECT id, 'bookmeter', series_id, series_number
FROM public.books
WHERE series_id IS NOT NULL;

COMMIT;
