-- Fingerprint of the user's rating bookcases (★☆☆☆☆ ... ★★★★★) at the last sync: rating:count
-- pairs, highest first, e.g. '5:10,4:27,3:108'; '' when the user has none. The sync re-imports a
-- user whose fingerprint changed even when their read counts did not, so rating changes show
-- up. NULL until the first sync that records it, which saves it without forcing a re-import.

ALTER TABLE public.users
    ADD COLUMN rating_bookcase_counts text;
