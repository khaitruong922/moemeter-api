# merge-books

Find and merge duplicate book entries in the database.

## Trigger

User says: "find duplicate books", "check books that need merging", "merge duplicate books", "run book merge check"

## Config

- DB connection: `DATABASE_URL` in `.dev.vars`
- API base: `http://localhost:8787`
- Bearer token: in `.dev.vars` — field named after JWT (ask user if needed)
- Merge: `POST /manual_book_merges` body `{ "base_id": number, "variant_id": number }`
- Revert: `POST /manual_book_merges/delete` body `{ "variant_id": number }`

## Step 1 — DB query for exact dupes

```sql
WITH active AS (
  SELECT DISTINCT b.id, b.title, b.author,
         remove_spaces(b.author) AS norm_author,
         COUNT(r.id) AS reads
  FROM reads r
  JOIN books b ON b.id = r.merged_book_id
  GROUP BY b.id, b.title, b.author
),
dupes AS (
  SELECT a1.id AS id1, a1.title AS title1, a1.reads AS rc1,
         a2.id AS id2, a2.title AS title2, a2.reads AS rc2,
         a1.author
  FROM active a1
  JOIN active a2
    ON a1.norm_author = a2.norm_author
    AND a1.title_cleaned = a2.title_cleaned
    AND a1.id < a2.id
)
SELECT * FROM dupes d
WHERE NOT EXISTS (
  SELECT 1 FROM final_book_merges fm
  WHERE (fm.base_id = d.id1 AND fm.variant_id = d.id2)
     OR (fm.base_id = d.id2 AND fm.variant_id = d.id1)
)
ORDER BY title1;
```

## Step 2 — Visual comparison (catches more)

Export all active books:

```sql
SELECT DISTINCT b.id, b.title, b.author, COUNT(r.id) AS reads
FROM reads r
JOIN books b ON b.id = r.merged_book_id
GROUP BY b.id, b.title, b.author
ORDER BY b.title;
```

Save to file, spawn Explore agent on the full file. Look for same book registered twice due to:
- Fullwidth vs halfwidth: `（）` vs `()`, `！` vs `!`, `～` vs `~`, `　` vs ` `, `ＢＯＸ` vs `BOX`
- Bracket style: `[上]` vs `［上］`
- Digit style: `２` vs `2`, `Ⅱ` vs `II`

**Do NOT flag:** different volumes, genuine 上/中/下 splits, different editions with different content.

## Step 3 — Show list, wait for approval

Always present full list before merging. Never auto-merge.

Rule: **base** = higher reads. Tie → lower id = base.

## Step 4 — Run merges

```bash
TOKEN="<from .dev.vars>"
API="http://localhost:8787/manual_book_merges"

for pair in "BASE1 VARIANT1" "BASE2 VARIANT2"; do
  base=$(echo $pair | cut -d' ' -f1)
  variant=$(echo $pair | cut -d' ' -f2)
  res=$(curl -s -w "\n%{http_code}" -X POST "$API" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"base_id\": $base, \"variant_id\": $variant}")
  echo "$(echo "$res" | tail -1) $base←$variant"
done
```

Expect `201` per merge.

## Step 5 — Revert

```bash
curl -s -X POST "$API/delete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"variant_id": VARIANT}'
```

Expect `200`.

## Skip list

Before proposing any merges, query the exceptions table and exclude all results:

```sql
SELECT bme.variant_id, b.title, b.author
FROM book_merge_exceptions bme
JOIN books b ON b.id = bme.variant_id;
```

Never propose a merge where either `id1` or `id2` appears as a `variant_id` in this table.

### Hardcoded exceptions

- 嘘 id 5623590 (太宰治) vs 5788944 (新美南吉) — different authors
- 化物語 上/下 — user managing separately

## DB helpers

- `normalize_title(title)` — strips punctuation/spaces
- `remove_spaces(author)` — strips spaces from author
- `title_cleaned` — generated column on `books`, auto-normalized
- `final_book_merges` view — auto merges + manual merges − exceptions
