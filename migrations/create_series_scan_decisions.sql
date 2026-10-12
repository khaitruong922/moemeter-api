-- Review decisions from the series scan (.claude/skills/series-scan), so a later scan does not
-- propose the same thing again: new_series / add_to_series + approved|rejected, keyed by the
-- candidate's fingerprint.
-- Approved series candidates are also applied through /manual_series; the row here only stops
-- them being re-proposed.

BEGIN;

CREATE TABLE public.series_scan_decisions (
    fingerprint text PRIMARY KEY,          -- "new:<sorted book ids>", "add:<book>:<series>"
    kind        text NOT NULL CHECK (kind IN ('new_series', 'add_to_series')),
    decision    text NOT NULL CHECK (decision IN ('approved', 'rejected')),
    book_ids    integer[] NOT NULL,
    series_id   integer,
    confidence  real,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_series_scan_decisions_books ON public.series_scan_decisions USING gin (book_ids);

ALTER TABLE public.series_scan_decisions OWNER TO postgres;
ALTER TABLE public.series_scan_decisions ENABLE ROW LEVEL SECURITY;

COMMIT;
