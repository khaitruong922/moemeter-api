-- One row per user who has rated anything, for the レーティング統計 page: how many books they
-- rated and their average. As in book_ratings, a user rates each merged book once, with their
-- highest rating across rereads and variants. Users flagged ratings_excluded have no ratings
-- stored, so they never appear. Names and avatars are joined at query time, not stored here.
-- refreshAll refreshes it after syncBookMerges, with book_ratings.

BEGIN;

CREATE MATERIALIZED VIEW public.rating_leaderboard AS
WITH user_ratings AS (
    SELECT user_id,
        merged_book_id,
        max(rating) AS rating
    FROM public.reads
    WHERE rating IS NOT NULL
    GROUP BY user_id, merged_book_id
)
SELECT user_id,
    count(*)::integer AS rating_count,
    avg(rating)::float8 AS rating_avg,
    rank() OVER (ORDER BY count(*) DESC)::integer AS count_rank,
    rank() OVER (ORDER BY avg(rating) DESC, count(*) DESC)::integer AS average_rank
FROM user_ratings
GROUP BY user_id;

CREATE UNIQUE INDEX idx_rating_leaderboard_user_id ON public.rating_leaderboard USING btree (user_id);

COMMIT;
