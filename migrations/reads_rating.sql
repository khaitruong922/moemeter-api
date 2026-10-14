-- Rating of a read, parsed by bookmeter-api from the book's bookcase names: a bookcase named
-- with five stars, filled then empty (★★★☆☆), rates the book by its filled count. NULL when the
-- book is on no rating bookcase. The 1-5 range is enforced in app logic, not by a constraint.
-- Nullable with no default, so the column is a metadata-only change.
--
-- book_ratings holds each merged book's average for the /books list, so the list doesn't
-- aggregate ratings per request. One rating per user and book: a user who rated several
-- variants or rereads counts once, with their highest. refreshAll refreshes it after
-- syncBookMerges, so it is always built from final merged_book_id values.

BEGIN;

ALTER TABLE public.reads
    ADD COLUMN rating smallint;

-- Only rated reads, which are few: lets the book_ratings refresh read this index instead of
-- scanning every read, and costs nothing when the sync writes unrated reads.
CREATE INDEX idx_reads_rated ON public.reads USING btree (merged_book_id, user_id, rating)
    WHERE (rating IS NOT NULL);

CREATE MATERIALIZED VIEW public.book_ratings AS
WITH user_ratings AS (
    SELECT merged_book_id AS book_id,
        user_id,
        max(rating) AS rating
    FROM public.reads
    WHERE rating IS NOT NULL
    GROUP BY merged_book_id, user_id
)
SELECT book_id,
    avg(rating)::float8 AS rating_avg,
    count(*)::integer AS rating_count
FROM user_ratings
GROUP BY book_id;

CREATE UNIQUE INDEX idx_book_ratings_book_id ON public.book_ratings USING btree (book_id);

COMMIT;
