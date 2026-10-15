-- 相性 for every pair of readers who rated a book in common, for the 読書仲間 tab. See
-- docs/affinity/README.md for why each number is what it is.
--
-- affinity_points(gap): points for one book by the gap in stars between two ratings: 0 → +3,
-- 1 → +1, 2 → −2, 3 → −4, 4 → −6, proportionally in between.
--
-- rating_affinity: one row per ordered pair (user_id, other_id), so a profile's readers are one
-- index lookup. A rating is a reader's highest for the merged book, as in book_ratings. The other
-- reader's ratings are also compared shifted by half the difference between the two averages, at
-- most ±0.35 stars, and each book scores the better of the two. Symmetric: (A, B) and (B, A)
-- have the same score.
--
-- refreshAll refreshes it after rating_leaderboard, whose averages it uses.

BEGIN;

CREATE FUNCTION public.affinity_points(gap double precision) RETURNS double precision
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT CASE
    WHEN gap >= 4 THEN -6
    WHEN gap >= 3 THEN -4 - 2 * (gap - 3)
    WHEN gap >= 2 THEN -2 - 2 * (gap - 2)
    WHEN gap >= 1 THEN 1 - 3 * (gap - 1)
    ELSE 3 - 2 * gap
  END::double precision
$$;

CREATE MATERIALIZED VIEW public.rating_affinity AS
WITH user_ratings AS (
    SELECT user_id,
        merged_book_id,
        max(rating) AS rating
    FROM public.reads
    WHERE rating IS NOT NULL
    GROUP BY user_id, merged_book_id
), pairs AS (
    SELECT mine.user_id,
        other.user_id AS other_id,
        (other.rating - mine.rating)::double precision AS diff,
        greatest(-0.35, least(0.35, 0.5 * (other_avg.rating_avg - my_avg.rating_avg))) AS shift
    FROM user_ratings mine
    JOIN user_ratings other
        ON other.merged_book_id = mine.merged_book_id AND other.user_id <> mine.user_id
    JOIN public.rating_leaderboard my_avg ON my_avg.user_id = mine.user_id
    JOIN public.rating_leaderboard other_avg ON other_avg.user_id = other.user_id
)
SELECT user_id,
    other_id,
    count(*)::integer AS rated_count,
    sum(greatest(public.affinity_points(abs(diff)), public.affinity_points(abs(diff - shift))))
        ::double precision AS score
FROM pairs
GROUP BY user_id, other_id;

CREATE UNIQUE INDEX idx_rating_affinity_pair ON public.rating_affinity USING btree (user_id, other_id);

COMMIT;
