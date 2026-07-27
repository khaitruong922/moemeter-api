-- Futaribocchi leaderboard: pairs of users who share books read by exactly 2 people
-- Shows book_count and total pages for each pair, with ranking
-- Within each pair, the user with more books_read appears first (tiebreaker: pages_read)

CREATE MATERIALIZED VIEW public.futaribocchi_leaderboard AS
WITH futaribocchi_books AS (
    -- Books read by exactly 2 users
    SELECT merged_book_id
    FROM public.reads
    GROUP BY merged_book_id
    HAVING COUNT(DISTINCT user_id) = 2
),
pair_books AS (
    -- For each futaribocchi book, get the pair of users who read it
    SELECT
        r1.user_id AS uid_a,
        r2.user_id AS uid_b,
        r1.merged_book_id,
        b.page
    FROM public.reads r1
    JOIN public.reads r2 ON r1.merged_book_id = r2.merged_book_id AND r1.user_id < r2.user_id
    JOIN futaribocchi_books fb ON fb.merged_book_id = r1.merged_book_id
    JOIN public.books b ON b.id = r1.merged_book_id
),
pair_stats AS (
    SELECT
        uid_a,
        uid_b,
        COUNT(*) AS book_count,
        COALESCE(SUM(page), 0) AS pages
    FROM pair_books
    GROUP BY uid_a, uid_b
),
ordered_pairs AS (
    -- Order users within each pair: more books_read first, tiebreaker pages_read
    SELECT
        CASE
            WHEN COALESCE(u1.books_read, 0) > COALESCE(u2.books_read, 0) THEN ps.uid_a
            WHEN COALESCE(u1.books_read, 0) < COALESCE(u2.books_read, 0) THEN ps.uid_b
            WHEN COALESCE(u1.pages_read, 0) >= COALESCE(u2.pages_read, 0) THEN ps.uid_a
            ELSE ps.uid_b
        END AS user1_id,
        CASE
            WHEN COALESCE(u1.books_read, 0) > COALESCE(u2.books_read, 0) THEN ps.uid_b
            WHEN COALESCE(u1.books_read, 0) < COALESCE(u2.books_read, 0) THEN ps.uid_a
            WHEN COALESCE(u1.pages_read, 0) >= COALESCE(u2.pages_read, 0) THEN ps.uid_b
            ELSE ps.uid_a
        END AS user2_id,
        ps.book_count,
        ps.pages
    FROM pair_stats ps
    JOIN public.users u1 ON u1.id = ps.uid_a
    JOIN public.users u2 ON u2.id = ps.uid_b
)
SELECT
    op.user1_id,
    op.user2_id,
    u1.name AS user1_name,
    u1.avatar_url AS user1_avatar_url,
    u2.name AS user2_name,
    u2.avatar_url AS user2_avatar_url,
    op.book_count,
    op.pages,
    RANK() OVER (ORDER BY op.book_count DESC, op.pages DESC) AS book_count_rank,
    RANK() OVER (ORDER BY op.pages DESC, op.book_count DESC) AS pages_rank
FROM ordered_pairs op
JOIN public.users u1 ON u1.id = op.user1_id
JOIN public.users u2 ON u2.id = op.user2_id
WITH NO DATA;

ALTER MATERIALIZED VIEW public.futaribocchi_leaderboard OWNER TO postgres;
