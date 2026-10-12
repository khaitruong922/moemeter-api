# merge-books

Find and merge duplicate book entries in the database.

## Trigger

User says: "find duplicate books", "check books that need merging", "merge duplicate books", "run book merge check"

## How detection works now

**Detection lives in code, not in an ad-hoc script.** `selectDuplicateBookCandidates`
(`src/db/book_merges.ts`) is the single source of truth, exposed as `GET /books/duplicate`.
Start there — do not rewrite the normalization by hand.

It scans the **whole `books` table**, not only books with reads. Series volumes pulled in by
`syncBookSeries` usually have no reads at all, and joining through `reads` used to hide every
duplicate among them (~2,700 books). Books already recorded as a variant in `final_book_merges`
are excluded, as are `book_merge_exceptions`.

Three passes, unioned with a disjoint-set:

1. **Composite key** — `normalize(canonicalizeTitle(title)) | normalize(author)`
2. **Credit subset** — same title key, and one author list contains the other. Catches a blank-author
   scrape stub beside its attributed twin, and an edition that additionally credits the illustrator
   (有川 浩 vs 有川 浩,村上 勉). Requires a *subset* relation, so disjoint credits stay apart.
3. **SQL prefix rule** — `selectAlgorithmicDuplicatePairs`, the same rule the `syncBookMerges` cron
   uses (extra paren annotation with a matching paren-stripped title, or an exact normalized match).

## Config

- DB connection: `DATABASE_URL` in `.dev.vars`
- API base: `http://localhost:8787` (needs `npm run dev`)
- Bearer token: mint an HS256 JWT signed with `JWT_SECRET` from `.dev.vars` (`validateToken` only
  verifies the signature; any `sub`/`exp` works)
- Candidates: `GET /books/duplicate`
- Merge one: `POST /manual_book_merges` body `{ "base_id": number, "variant_id": number }` → `201`
- Merge all candidates: `POST /manual_book_merges/apply_all` → **auto-merges without review**
- Revert: `POST /manual_book_merges/delete` body `{ "variant_id": number }` → `200`
- Add exception: `POST /book_merge_exceptions` body `{ "variant_id": number }` → `201`
- Drop exception: `POST /book_merge_exceptions/delete` body `{ "variant_id": number }`

All mutating routes require the bearer token. Note the route file is `src/routes/book_ merge_exceptions.ts`
— the filename really does contain a space.

## Step 1 — Run the endpoint

```bash
curl -s http://localhost:8787/books/duplicate | python3 -m json.tool
```

Returns `[{ base, variants[] }]` with `read_count`, `series_id`, `series_name` per book.

## Step 2 — Show list, wait for approval

Always present the full list first. **Never auto-merge**, and never reach for `apply_all` unless the
user has already reviewed the exact same list.

Base selection is done by `rankBook`, in order:

1. belongs to a series (`series_id` not null) — even with fewer reads, because the series-linked
   record is the canonical one and merging does not carry `series_id` across
2. has a non-blank author — so a scrape stub never becomes the surviving book
3. higher `read_count`

Ties beyond that are unspecified; when proposing a pair by hand, use lower id as base.

Watch for one artefact: if the series-linked record is itself a 特装版/特典 edition, rule 1 makes the
special edition the base. Flag it and let the user flip it.

## Step 3 — Apply

```bash
TOKEN=$(node -e "
const c=require('crypto'),s=process.env.JWT_SECRET;
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({sub:'merge-books',exp:Math.floor(Date.now()/1000)+3600});
console.log(h+'.'+p+'.'+c.createHmac('sha256',s).update(h+'.'+p).digest('base64url'));
")
curl -s -w "\n%{http_code}\n" -X POST http://localhost:8787/manual_book_merges \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"base_id": BASE, "variant_id": VARIANT}'
```

Note: outbound `curl` to localhost may be blocked by the permission classifier. If so, stop and ask
the user to run it or to add a Bash rule — **do not** insert into `manual_book_merges` via psql, which
skips `refreshAll` and leaves the materialized views stale.

## Step 4 — Score the algorithm against history (do this before adding rules)

The objective test: how many of the already-accepted merges does the current key reproduce?

```bash
psql "$DB" -t -A -F$'\t' -c "
SELECT bb.title, vb.title FROM final_book_merges f
JOIN books bb ON bb.id=f.base_id JOIN books vb ON vb.id=f.variant_id;" > /tmp/merged_pairs.tsv
```

Then feed both titles through `titleOnlyKey` and count matches. **Currently 635/663 = 95.78%**
(93.36% once the author gate is applied). Re-measure rather than trusting this number — the score
*drifts down* as new merges land, so a stale figure hides regressions.
Any pair that does not collapse is either a missing rule or a deliberate omission — inspect the
leftover fragments rather than guessing at new rules. This method found every gap worth fixing,
including a `〜` U+301C vs `～` U+FF5E bug that no amount of eyeballing would have surfaced.

The remaining ~21 misses are subtitle-drops (サイコロジカル 上 = サイコロジカル(上) 兎吊木垓輔の戯言殺し)
and word reorders (フルメタル・パニック!). **Deliberately not automated** — stripping subtitles merges
distinct volumes across many series.

## Step 5 — Exploratory scan (only when the endpoint returns nothing)

Export the pool, then block by character 3-grams **author-blind**, score with `SequenceMatcher`,
and require a matching volume signature (arabic + roman + kanji numerals, 上/中/下, 前/後編, 第N部).

Prune with **co-reads**: if any user logged both books, treat them as different books. This removes
~98% of candidates.

**It is not lossless.** Measured against the whole accepted history, **13 of 674 merges (1.9%) have a
co-reader** — always the same shape, one user logging both editions (86―エイティシックス― vs ８６―,
ようこそ実力至上主義の教室へ7.5 vs 〇 7.5, 小説 君の名は。 vs 君の名は。). A rescue pass over what the filter
discards: keep pairs with exactly 1 co-reader where that user logged both on the **same date**, or
at a **constant `index` offset** across a batch (a user re-importing their list mints new ids).
Note `reads.id` is a global bookmeter sequence and disagrees with `index` for 6,738 of 17,872 reads,
so registration order is a separate probe from the user's own ordering.

```sql
SELECT p.id1, p.id2, COUNT(DISTINCT r1.user_id)
FROM p JOIN reads r1 ON r1.merged_book_id = p.id1
       JOIN reads r2 ON r2.merged_book_id = p.id2 AND r2.user_id = r1.user_id
GROUP BY p.id1, p.id2;
```

Signals measured and found **worthless** — don't spend time on them again:

| Signal | Outcome |
|---|---|
| Similarity threshold below 0.72 | +282 candidates, 0 unique finds |
| Page-count matching | 20 pairs, 0 unique finds — same-imprint light novels share page counts |
| Character-multiset (word reorder) | 13 groups, all digit transpositions (`12`/`21`) |
| Same series + same `series_number` | **Saturated, not empty.** Measured on the **raw** `books` table (not the filtered pool): **312 slots hold ≥2 records, and all 312 have exactly one survivor** — every other occupant is already merged. Bookmeter's numbering is ground truth for volume identity and is fully worked through. Re-run after each series sync; it is one `GROUP BY` with no false positives by construction. |
| Subtitle-drop / prefix containment | 222 candidates, 8 survivors, 0 genuine |
| Cover-image identity | **exhausted.** All 9,500 covers were fetched and hashed (HTTP length, md5, perceptual dHash): excluding placeholders, all 9,486 URLs are unique and 9,470 dHashes distinct. 0 finds. |
| Cover-image **placeholders** | there are **two**, not one: `bookmeter.com/images/common/book.png` (8 books) and `m.media-amazon.com/images/I/01MKUOLsA5L._SL500_.gif` (8 books, Amazon's "no image"). Plus ~577 generic 青空文庫 text-template covers that are perceptually identical. Exclude all of these or any cover rule emits bogus groups. |
| Amazon cover-id fuzzing (prefix/stem/hamming≤1) | dead by construction — all ids are opaque 11-char tokens with one suffix form. 0 finds. |
| Review-text similarity | fires on real duplicates but coverage is tiny (only 544 pool books have a review >20 chars) and it must have star/boilerplate templates stripped first, or it returns 399 junk pairs. |

Also measured and empty (2026-08-21, five-agent sweep): kanji itaiji folding (竜/龍, 沢/澤, 斎/齋),
iteration marks, katakana long-vowel/dakuten/ヴ-ブ folding, kanji→arabic numerals, NFD dakuten,
halfwidth katakana (absent from this data), romaji cross-script matching, identical reader sets,
`reads.index` gaps, per-user series gaps, page-count rarity weighting, credit-subset + equal page,
series-linkage asymmetry, cross-series volume identity, near-duplicate series names, and
transitive cover matching. ~5,250 candidate pairs examined across the five strategies, 2 survived.

**Do NOT flag:** different volumes, genuine 上/中/下 splits, volume ranges (1-45 vs 46-90), a single
story vs an anthology containing it (page count gives it away: 走れメロス 38p vs 富嶽百景・走れメロス 他八篇
238p), 分冊 editions vs the single volume (1Q84 BOOK2 前編/後編 vs BOOK 2), and spinoffs (Ex/SS/短編集/外伝).

## Normalization already implemented

Don't re-derive these; they live in `canonicalizeTitle` / `normalize`.

- **Punctuation & whitespace** stripped, including quote variants (`“ ” ‟ 〝 〟 ＂`), `※`, `:`/`：`, and
  non-ASCII dashes (`‐ – — ―`). `〜` U+301C is listed explicitly — NFKC leaves it alone while the
  visually identical `～` U+FF5E folds to ASCII `~`.
- **Bonus/digital tags** — `【電子版限定特典付き】`, `【電子特別版】` (needs its own alternative: it is
  電子+特別+版, never contains 電子版), and bare `特装版` forms (`グッズ付き特装版`, `SS冊子付き特装版`).
- **Edition markers** — 新装版, 新組版, 完全版, 愛蔵版, 図書館版, stripped anywhere.
- **Leading tags** — `[2巻]`, `【小説1巻】`; the `小説 ` novelisation prefix; a bare leading imprint
  (`KAエスマ文庫 …`).
- **Trailing annotations** — parens, `[]` and `【】`, iteratively, allowing **one nested pair** so
  `(青空文庫POD（ポケット版）)` matches. Guarded by `isVolumeMarker` so `(上)`/`(前編)`/`(3)` survive.
  Also a trailing `: TO Books.` and a trailing bare series name (`… 比嘉姉妹シリーズ`) — trailing-only,
  because a *leading* series name is often the only thing identifying the work.
- **Numerals** — roman I–XXXIX parsed as whole tokens (the old per-numeral passes could never convert
  XI and up), `上巻`/`下巻` → `上`/`下`, and **volume "1" ≡ no volume** (`とらドラ!1` = `とらドラ!`); only
  `1` is dropped, so `X 2` / `X 11` / `X 21` keep their numbers.

## Skip list

### DB-enforced exceptions (`book_merge_exceptions`)

Always query live — never hardcode:

```sql
SELECT bme.variant_id, b.title, b.author
FROM book_merge_exceptions bme JOIN books b ON b.id = bme.variant_id;
```

### Hardcoded

- 嘘 id 5623590 (太宰治) vs 5788944 (新美南吉) — different authors
- 化物語 上/下 (580220, 11072380, 580222, 11093014) — already in the exceptions table; appear as exact
  dupes every run

### Same title, different author — recurring, never merge

鼻 (曽根圭介 / 芥川竜之介) · 風立ちぬ (堀辰雄 / 宮崎駿) · リバース (湊かなえ / 五十嵐貴久) ·
羅生門 (芥川竜之介 / 楠山正雄) · 月灯館殺人事件 / 涜神館殺人事件 · 銀河鉄道の夜 vs 新編 銀河鉄道の夜 (432p anthology)

### Juvenile editions ARE merged

A children's-imprint guard was removed from the code: the history has **9 juvenile↔adult merges
accepted by hand** (君の名は。/ 天気の子 / すずめの戸締まり / 時をかける少女 / きまぐれロボット /
ほしのこえ / 銀河鉄道の夜 / 泣きたい私は猫をかぶる) and **0** matching exceptions. Treat
つばさ文庫 / 青い鳥文庫 / ジュニア文庫 as the same book. Don't reintroduce the guard.

Comic adaptations are also merged into the source novel (薬屋のひとりごと, わたしの幸せな結婚,
ロウきゅーぶ!, 異世界魔王, 私の推しは悪役令嬢。). Not automated — it requires ignoring a real volume
number when the imprint is a comics label.

## Related

`GET /series/read-gaps` (`selectSeriesWithReadGaps`) lists series where an unread volume sits before
or between read volumes — `0 0 0 5` and `5 5 0 5` reported, `5 5 0 0 0` not. A gap can mean a missing
merge, but as of 2026-08-21 all 18 gap volumes were cross-referenced against the library and **none**
had a read twin, so those are genuine reading gaps.

## DB helpers

- `normalize_title(title)` — strips spaces, folds fullwidth digits/？
- `remove_spaces(author)` — strips spaces
- `remove_parentheses(input)` — strips `(...)` and contents; **not** nesting-aware
- `title_cleaned` — generated column on `books`; **must be in the CTE SELECT** when used in joins
- `final_book_merges` view — **(auto merges − exceptions) + manual merges**. The exception filter is
  applied ONLY to the `book_merges` branch, so an exception can never undo a *manual* merge.
  **12 of the 20 current exceptions are therefore inert**, including documented never-merge cases
  (羅生門 11470982, 雪国 6955448, 注文の多い料理店 578230, キノの旅 8162564, 狼と香辛料 8229648).
  Adding an exception for such a pair silently does nothing. Fixing it needs a view redefinition.

## Open items

- **カラフル** — `580524` 森 絵都 (272p, 文春文庫) vs `21765355` 阿部 暁子 (272p). Identical title and
  page count, disjoint authors, no co-readers. Needs the two Bookmeter pages checked by hand.
- Real further gains need **ISBN/ASIN captured at scrape time** in `bookmeter-api`. Title and credit
  metadata is exhausted; exact identifiers would settle カラフル and word-order cases like
  フルメタル・パニック! that no string rule reaches.

## Run history

| Date | Pool | Method | Found | Merged |
|------|------|--------|-------|--------|
| 2026-05-13 | 5,420 active | psql + python + Explore agent | 18 (fullwidth + publisher suffix; 刀語, 空の境界, 猫物語, 雪国) | 18 |
| 2026-08-21 | 6,700 active → 9,400 full library | endpoint + history scoring + author-blind/co-read scan | 54 across the session (quote/dash/※ variants, 電子版・特装版 tags, `[N巻]` prefixes, nested-paren POD suffixes, 新組版, blank-author stubs, credit subsets, wave dash, series-sync volumes) | 54 |
| 2026-08-21 | 9,399 full library | full re-scan, all signals | 0 | 0 |
| 2026-08-21 | 9,500 full library | **5 parallel strategies** (orthography/Unicode, metadata triangulation incl. hashing all 9,500 covers, reader topology, series structure, merge-history mining) | 2 judgement calls, 0 clear-cut; plus 3 verified bugs | 0 |
