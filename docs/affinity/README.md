# 相性 (rating affinity) score

How similar two readers' taste is, from the books both rated. It orders the 読書仲間 tab
(相性順) and is shown as a percentage on each reader's card. Status as of 2026-10-15: built.

| Part | Where |
|---|---|
| Score per pair: `rating_affinity` view, `affinity_points()` | `migrations/create_rating_affinity.sql`, refreshed in `refreshAll` |
| Dynamic scale and percentage, `affinity` / `affinity_percent` in `GET /users/:id/common_reads` | `src/db/reads.ts` |
| Color | `moemeter/src/utils/rating.ts` (`affinityColor`) |
| Sorts 共読数順 / 相性順 | `moemeter/src/components/profile/ProfileFriendsTab.tsx` |
| Rating comparison bar, comparison stars | `moemeter/src/components/RatingAgreementBar.tsx`, `CompareStars.tsx` |

## The score

For a profile user A and another reader B, over every book both rated:

```
shift        = clamp(½ × (avg(B) − avg(A)), −0.35, +0.35)
points(book) = max(table(|B − A|), table(|B − A − shift|))
相性          = Σ points over the books both rated
shown as     = 1 / (1 + e^(−相性 ÷ scale)), as a percentage, at most 99%
scale        = max(95th percentile of 相性 over all pairs ÷ ln 4, 10)
```

| gap (stars) | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| points | **+3** | **+1** | **−2** | **−4** | **−6** |

- **Ratings** are bookcase ratings (★☆☆☆☆ … ★★★★★), one per reader and merged book. A reader's
  rating of a book is their highest across rereads and variants, the same rule as `book_ratings`.
- **avg(X)** is X's average over **all** their rated books, from `rating_leaderboard.rating_avg`
  (the レーティング統計 page).
- Gaps between whole stars score proportionally. A gap of 0.75 scores 3 − 0.75 × 2 = +1.5.
- The score is a **sum**. More shared books with similar taste rank higher, and one or two
  shared books stay near 50%.
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

### Percentage

The sum is unbounded (−6 to +3 per book), so it is mapped onto 0–1 with a logistic curve. Order
is unchanged. 50% means no evidence either way. The display is capped at 99%, so it never claims
a perfect match.

The curve's **scale is dynamic**. It is set so the top 5% of pairs (the 95th percentile of
`rating_affinity`) show 80%. With a fixed scale, totals grow as members rate more, and every
long-standing pair would creep toward 99%. With the dynamic scale, 80% keeps meaning "top 5% of
the group". The 95th percentile was chosen because it gives today's scale (27.4 on 2026-10-15,
against a fixed 30 before) and rests on about 15 pairs, so it doesn't jump. The 99th percentile
rests on 3 pairs; the 90th would have raised nearly every score. A floor of 10 keeps the scale
from collapsing while few pairs exist.

The trade-off: a pair's percentage can move when other pairs change, even if nothing changed
between the two. Their points total and their order only change with their own ratings.

On 2026-10-15, across all 289 pairs with shared ratings: median 52%, 12 pairs at 80% or above,
56 below 50%.

| shared rated books | 1 | 2–3 | 4–9 | 10–24 | 25+ |
|---|---|---|---|---|---|
| median 相性 | 51% | 53% | 56% | 63% | 81% |

The color runs from red (≤30%) through amber (around 55%) to Bookmeter green (85%+).

## Known trade-offs

- **Volume can outweigh closeness.** Cyn × Gia has no exact matches but reaches 87% from 67
  shared books. 相性 reads as "how much shared taste", not "how close".
- **Small perfect matches stay near 50%.** Two identical ratings show 55%. The book count beside
  the score explains it.
- **A consistent 2-star offset scores well below neutral.** Gia × WorldIsMyne are 2 stars apart on
  28 of 31 books and show 33%. Same order, very different scale. That's not counted as a strong
  match.
- **Averages drift.** Each new rating moves a reader's average a little, so scores shift slightly
  after syncs.

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
- The scale reference: `AFFINITY_REFERENCE_PERCENTILE` (0.95), `AFFINITY_REFERENCE_PERCENT` (0.8)
  and `AFFINITY_MIN_SCALE` (10), in `src/db/reads.ts`.
- The colors: `AFFINITY_COLOR_STOPS` in `moemeter/src/utils/rating.ts`.
