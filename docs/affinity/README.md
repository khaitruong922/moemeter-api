# 相性 (rating affinity) score

How similar two readers' taste is, from the books both rated. It orders the 読書仲間 tab
(相性順) and is shown as a percentage on each reader's card. Status as of 2026-10-15: built.

| Part | Where |
|---|---|
| `rating_agreements` and `rating_avg` in `GET /users/:id/common_reads` | `src/db/reads.ts`, `src/routes/users.ts` |
| Score, percentage, color | `moemeter/src/utils/rating.ts` (`computeAffinity`, `affinityToPercent`, `affinityColor`) |
| Sorts 共読数順 / 相性順 | `moemeter/src/components/profile/ProfileFriendsTab.tsx` |
| Rating comparison bar, comparison stars | `moemeter/src/components/RatingAgreementBar.tsx`, `CompareStars.tsx` |

## The score

For a profile user A and another reader B, over every book both rated:

```
shift        = clamp(½ × (avg(B) − avg(A)), −0.25, +0.25)
points(book) = max(table(|B − A|), table(|B − A − shift|))
相性          = Σ points over the books both rated
shown as     = 1 / (1 + e^(−相性 ÷ 30)), as a percentage, at most 99%
```

| gap (stars) | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| points | **+3** | **+1** | **−1** | **−4** | **−6** |

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
- **2 stars: −1.** A mild disagreement.
- **3 stars: −4.** A strong clash outweighs one perfect match.
- **4 stars: −6.** The end of the slope. It is rare.

### Average adjustment: small, and it only helps

Some readers rate harshly and some generously (Snoweony averages 2.65, Gia 4.61). The shift
forgives part of that. Two rules keep it from distorting the score:

- **At most ±0.25 stars.** At ±0.5, Gia (one star above Cyn on almost every book, no exact
  matches, 21 books 2+ apart) scored 95%, level with readers who share real agreement. At ±0.25
  a consistent 1-star offset scores +1.5 per book instead of +2, and Cyn × Gia drops to 88%.
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
is unchanged. 50% means no evidence either way. A sum of +30 shows about 73%, and +60 about 88%.
The display is capped at 99%, so it never claims a perfect match.

On 2026-10-15, across all 289 pairs with shared ratings: median 52%, 12 pairs at 80% or above,
31 below 50%.

| shared rated books | 1 | 2–3 | 4–9 | 10–24 | 25+ |
|---|---|---|---|---|---|
| median 相性 | 51% | 53% | 56% | 63% | 81% |

The color runs from red (≤30%) through amber (around 55%) to Bookmeter green (85%+).

## Known trade-offs

- **Volume can outweigh closeness.** Cyn × Gia averages 0.87 points per book but reaches 88% from
  67 shared books. 相性 reads as "how much shared taste", not "how close".
- **Small perfect matches stay near 50%.** Two identical ratings show 55%. The book count beside
  the score explains it.
- **A consistent 2-star offset scores below neutral.** Gia × WorldIsMyne are 2 stars apart on 28
  of 31 books and show 42%. Same order, very different scale. That's not counted as a strong
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

In `moemeter/src/utils/rating.ts`:

- `AFFINITY_POINTS`: the points table.
- `AFFINITY_SHIFT_STRENGTH`: ½.
- `AFFINITY_MAX_SHIFT`: 0.25.
- `AFFINITY_SCALE`: 30.
- `AFFINITY_COLOR_STOPS`.
