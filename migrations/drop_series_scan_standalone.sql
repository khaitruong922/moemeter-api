-- Standalone books are no longer tracked by the series scan; only series decisions are recorded.

BEGIN;

DELETE FROM public.series_scan_decisions WHERE kind = 'standalone';
ALTER TABLE public.series_scan_decisions DROP CONSTRAINT series_scan_decisions_kind_check;
ALTER TABLE public.series_scan_decisions
    ADD CONSTRAINT series_scan_decisions_kind_check CHECK (kind IN ('new_series', 'add_to_series'));

COMMIT;
