-- Manual series ids are allocated in code (insertManualSeries), so the sequence and the range
-- check added by create_series_books.sql are no longer needed. The check gave little protection
-- anyway: upsertSeries' ON CONFLICT path never changes `source`, so it passed on a clash. The
-- real guard is upsertSeries only updating rows WHERE source = 'bookmeter'.

BEGIN;

ALTER TABLE public.series DROP CONSTRAINT IF EXISTS series_manual_id_range;
DROP SEQUENCE IF EXISTS public.manual_series_id_seq;

COMMIT;
