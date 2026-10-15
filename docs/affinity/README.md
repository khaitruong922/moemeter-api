# 相性 (rating affinity) score

How similar two readers' taste is, from the books both rated. It orders the 読書仲間 tab
(相性順) and is shown as a percentage on each reader's card. Status as of 2026-10-15: built.

| Part | Where |
|---|---|
| Score per pair: `rating_affinity` view, `affinity_points()` | `migrations/create_rating_affinity.sql`, refreshed in `refreshAll` |
| Average and percentage, `affinity` / `affinity_percent` in `GET /users/:id/common_reads` | `src/db/reads.ts` |
| Color | `moemeter/src/utils/rating.ts` (`affinityColor`) |
| Sorts 共読数順 / 相性順 | `moemeter/src/components/profile/ProfileFriendsTab.tsx` |
| Rating comparison bar, comparison stars | `moemeter/src/components/RatingAgreementBar.tsx`, `CompareStars.tsx` |

## The score

For a profile user A and another reader B, over every book both rated:

```
shift        = clamp(½ × (avg(B) − avg(A)), −0.35, +0.35)
points(book) = max(table(|B − A|), table(|B − A − shift|))
相性          = Σ points ÷ (books both rated + 10)        average points per book
shown as     = 1 / (1 + e^(−k × 相性)), k = 1.5 above 0 and 0.75 below, at most 99%
```

| gap (stars) | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| points | **+3** | **+1** | **−2** | **−4** | **−6** |

- **Ratings** are bookcase ratings (★☆☆☆☆ … ★★★★★), one per reader and merged book. A reader's
  rating of a book is their highest across rereads and variants, the same rule as `book_ratings`.
- **avg(X)** is X's average over **all** their rated books, from `rating_leaderboard.rating_avg`
  (the レーティング統計 page).
- Gaps between whole stars score proportionally. A gap of 0.75 scores 3 − 0.75 × 2 = +1.5.
- The score is an **average**, as if 10 books worth 0 points were added. A few shared books stay
  near 50%, and more books bring a pair toward its real average. Close ratings matter more than
  the number of books.
- Readers with no shared ratings have no score. 相性順 leaves them out and shows each card's
  shared rated books only.

## Why each part

### Points table: reward close, punish far

- **0 stars: +3.** An exact match is the strongest signal.
- **1 star: +1, a third of a match.** Ratings are noisy: the same reader might give 4 one day and
  5 another, so a 1-star gap is usually still agreement. It is the most common outcome (234 of
  つー's 538 shared ratings are about 1 star apart), so this value moves the ranking most. It
  was tested at 0, +0.5, +1, +1.5 and +2. +1 is the middle, where the top holds steady.
- **2 stars: −2.** A clear disagreement, on an even slope with the rest. At −1, pairs with many
  2-star gaps sat above neutral. At −2, pairs below 50% go from 31 to 56 of 289, and the top of
  the list barely moves.
- **3 stars: −4.** A strong clash outweighs one perfect match.
- **4 stars: −6.** The end of the slope. It is rare.

### Average adjustment: small, and it only helps

Some readers rate harshly and some generously (Snoweony averages 2.65, Gia 4.61). The shift
forgives part of that. Two rules keep it from distorting the score:

- **At most ±0.35 stars.** That covers moderate scale differences fully: Snoweony is 0.65
  harsher than つー, so the shift is 0.325, and つー × Snoweony shows 59% (50% at ±0.25). It still
  caps the most extreme rater: at ±0.5, Gia (one star above Cyn on almost every book, no exact
  matches) reached 93%, level with readers who share real agreement. At ±0.35, Cyn × Gia is 87%.
- **A book scores the better of its raw and shifted gap.** The averages can lift a book, but
  never push it below its raw points. The same rating is always +3. A harsh rater who loves a
  book can't become a bigger clash than the stars show.

Rejected along the way:

- **Full adjustment** (compare each rating with that reader's own average). Generous raters hit
  the ceiling: Gia's 5 is only +0.39 above her average, so Gia and つー both giving 5★ scored
  about +0.4.
- **Pulling averages toward the group average** for readers with few ratings. It barely changed
  the ranking and made the formula harder to follow.

### Average, not sum

The first version added the points up. That made 相性 "how much shared taste": many loosely
agreeing books beat fewer close ones (Cyn × Gia, no exact matches, 85% from 67 books), and every
pair crept upward as people rated more, so the percentage needed a scale. A fixed scale lets
everyone drift toward 99%. A scale that followed the group (the 95th percentile of all pairs at
80%) moved with other people: two new raters on 2026-10-15 dropped it from 27.4 to 19.2,
raising everyone's percentage while no pair had changed.

The average needs no scale. A pair's 相性 depends only on the two readers' ratings and their own
averages, so new members and other pairs never move it, and agreeing pairs level off near their
real closeness instead of creeping up. One more shared book moves it by 1 ÷ (books + 11) of its
points: a lot early, little once many books are shared.

### Percentage

The average (−6 to +3) goes on a logistic curve: 0 is 50%, higher is above, lower is below, and it
never quite reaches 0% or 100%. Order is unchanged. The display is capped at 99%.

Below 50% the curve is half as steep (0.75). A book can lose up to 6 points but earn at most 3, so
with one steepness the low end came twice as fast: 1% took 9 books all 5★ vs 1★, while 99% took
133 identical ones. Halved, 1% also takes about 133 books of the worst clash, and the most
clashing pairs read 10–35% rather than 1–20% (Snoweony × Gia 11%, nemlevi × Gia 33%). The
asymmetric points still decide every pair's average and the ranking; this only changes how a
negative average is shown.

The steepness is 1.5. 1.3 matched the earlier total-based score's spread on 2026-10-15 (16 pairs
at 80% or above, against 15), but a strong pair like Cyn × つー (57% identical over 51 books) read
only 88%. With the average, a pair's ceiling is set by how it rates, and the number of books
decides how close it gets:

| typical shared books | average per book | ceiling |
|---|---|---|
| all identical | +3.0 | 99% |
| half identical, half 1★ apart | +2.0 | 95% |
| typical pair (about +1.3) | +1.3 | 88% |
| all 1★ apart | +1.0 | 82% |

All identical reaches 80% at 5 books, 90% at 10, 95% at 19, and 99% only at 133.

In general, for a pair whose books average a points each (3 if all identical), the shared books
needed to show p:

```
x = ln(p ÷ (1 − p)) ÷ 1.5        the average that shows p
n = 10 × x ÷ (a − x)             only possible when a > x
```

On 2026-10-15, across 324 pairs: median 60%, 27 pairs at 80% or above (5 at 90%+), 67 below 50%.
つー's top: Cyn 91% (51 books), Trivel 90% (33), Mixu 89% (19), Antimony 87% (18), nat 87% (9).

The color runs from red (≤30%) through amber (around 55%) to Bookmeter green (85%+).

## Known trade-offs

- **Small perfect matches start modestly.** One identical rating shows 60%, three show 74%. The
  book count beside the score explains it.
- **A few books can outrank many.** nat (9 books) sits level with Antimony (18) at 87%, above
  BugEy3d (47 books, mostly 1★ apart). That's the intent: close ratings over volume.
- **A consistent 2-star offset scores well below neutral.** Gia × WorldIsMyne are 2 stars apart on
  28 of 31 books and show 33%. Same order, very different scale. That's not counted as a strong
  match.
- **Averages drift.** Each new rating moves a reader's own average a little, which can nudge
  their pairs by a fraction of a point after syncs.

## Alternatives considered

| Idea | Why not |
|---|---|
| 一致率 (exact matches ÷ shared ratings) | Ignores near agreement. 1 of 1 matching scores 100% and ranks first. |
| s = 1 − mean gap ÷ 4, pulled toward 0.5 | 0.5 isn't neutral (typical s is 0.77), so readers with few books sank to the bottom. |
| Overlap share (Jaccard) blended in | Mixes "read the same books" with "agree on them". 共読数順 covers overlap. |
| Unrated shared reads, weighted by rarity | A shared read says nothing about liking, and unrated reads would let volume dominate. |
| Co-deviation sum, Pearson | Noisy, and unstable with fewer than about 5 shared books. |

## Tunables

- The points table: `affinity_points()` in `migrations/create_rating_affinity.sql`.
- The shift (½, at most ±0.35): `rating_affinity` in the same file. Changing either needs a
  migration that recreates the view.
- The neutral books (10) and the curve's steepness (1.5, half below 50%): `AFFINITY_NEUTRAL_BOOKS`,
  `AFFINITY_STEEPNESS` and `AFFINITY_STEEPNESS_BELOW` in `src/db/reads.ts`.
- The colors: `AFFINITY_COLOR_STOPS` in `moemeter/src/utils/rating.ts`.
