-- Step 3 of the move to series_books (docs/series/README.md §2): rebuild series_leaderboard on
-- book_series instead of books.series_id. book_series already yields one row per canonical book,
-- so the old canonical_books / deduped CTEs go away; the columns and ranks are unchanged.
--
-- Apply only after the dual-write (mirrorSeriesBooks) is deployed, otherwise series_books goes
-- stale and so does this view.

BEGIN;

DROP MATERIALIZED VIEW public.series_leaderboard;

CREATE MATERIALIZED VIEW public.series_leaderboard AS
WITH book_stats AS (
    SELECT bs.series_id,
        bs.book_id,
        b.page,
        count(DISTINCT r.user_id)::integer AS reader_count
    FROM public.book_series bs
    JOIN public.books b ON b.id = bs.book_id
    LEFT JOIN public.reads r ON r.merged_book_id = bs.book_id
    GROUP BY bs.series_id, bs.book_id, b.page
), series_agg AS (
    SELECT series_id,
        count(book_id)::integer AS total_book_count,
        sum(reader_count)::integer AS total_reads_count,
        COALESCE(sum(COALESCE(page, 0)), 0::bigint)::integer AS total_pages
    FROM book_stats
    GROUP BY series_id
), series_readers AS (
    SELECT bs.series_id,
        count(DISTINCT r.user_id)::integer AS read_count
    FROM public.book_series bs
    LEFT JOIN public.reads r ON r.merged_book_id = bs.book_id
    GROUP BY bs.series_id
), user_series_reads AS (
    SELECT bs.series_id,
        r.user_id,
        count(DISTINCT bs.book_id) AS books_read
    FROM public.book_series bs
    JOIN public.reads r ON r.merged_book_id = bs.book_id
    GROUP BY bs.series_id, r.user_id
), completed_agg AS (
    SELECT usr.series_id,
        count(*)::integer AS completed_count
    FROM user_series_reads usr
    JOIN series_agg sa ON sa.series_id = usr.series_id
    WHERE usr.books_read >= sa.total_book_count
    GROUP BY usr.series_id
)
SELECT s.id,
    s.name,
    sa.total_book_count,
    sr.read_count,
    sa.total_reads_count,
    sa.total_pages,
    COALESCE(ca.completed_count, 0) AS completed_count,
    rank() OVER (ORDER BY sa.total_reads_count DESC)::integer AS reads_rank,
    rank() OVER (ORDER BY sr.read_count DESC)::integer AS read_count_rank,
    rank() OVER (ORDER BY sa.total_book_count DESC)::integer AS book_count_rank,
    rank() OVER (ORDER BY sa.total_pages DESC)::integer AS pages_rank,
    rank() OVER (ORDER BY COALESCE(ca.completed_count, 0) DESC)::integer AS completed_rank
FROM public.series s
JOIN series_agg sa ON sa.series_id = s.id
JOIN series_readers sr ON sr.series_id = s.id
LEFT JOIN completed_agg ca ON ca.series_id = s.id;

ALTER MATERIALIZED VIEW public.series_leaderboard OWNER TO postgres;
-- Same privileges the dropped view had
GRANT ALL ON public.series_leaderboard TO anon, authenticated, service_role;

COMMIT;
