-- Make yearly_leaderboard match the user's Bookmeter numbers.
-- Pages came from the merge target (r.merged_book_id), so a read logged on a 200-page edition
-- merged into a 180-page one summed 180; use the logged edition (r.book_id) instead. Books were
-- count(DISTINCT merged_book_id), which dropped rereads (and collapsed different editions merged
-- together) while pages still summed every read; count every read row, as Bookmeter does.
-- The year boundary now follows JST instead of the DB session timezone (UTC).

BEGIN;

DROP MATERIALIZED VIEW public.yearly_leaderboard;

CREATE MATERIALIZED VIEW public.yearly_leaderboard AS
WITH user_stats AS (
    SELECT u.id,
        u.name,
        u.avatar_url,
        COALESCE(sum(b.page), 0::bigint) AS pages_read,
        count(*) AS books_read
    FROM public.reads r
    JOIN public.users u ON u.id = r.user_id
    LEFT JOIN public.books b ON b.id = r.book_id
    -- r.date is Bookmeter's calendar date (no timezone); take "this year" in JST, since the DB
    -- session runs in UTC and would keep showing last year until 09:00 JST on Jan 1.
    WHERE r.date >= date_trunc('year', (now() AT TIME ZONE 'Asia/Tokyo'))::date
      AND r.date < (date_trunc('year', (now() AT TIME ZONE 'Asia/Tokyo')) + '1 year'::interval)::date
    GROUP BY u.id
)
SELECT id,
    name,
    avatar_url,
    books_read,
    pages_read,
    rank() OVER (ORDER BY books_read DESC, pages_read DESC) AS rank,
    rank() OVER (ORDER BY pages_read DESC, books_read DESC) AS pages_rank
FROM user_stats;

ALTER MATERIALIZED VIEW public.yearly_leaderboard OWNER TO postgres;

COMMIT;
