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

## Step 0 — Load exceptions

Always do this first. These variant_ids must never be proposed as merge candidates.

```bash
DB=$(grep DATABASE_URL .dev.vars | cut -d= -f2-)
psql "$DB" -c "
SELECT bme.variant_id, b.title, b.author
FROM book_merge_exceptions bme
JOIN books b ON b.id = bme.variant_id;"
```

Never propose a merge where either `id1` or `id2` appears as a `variant_id` in `book_merge_exceptions`.

## Step 1 — DB query for exact dupes

`title_cleaned` is a generated column on `books` — must be selected in the CTE, not referenced bare.

```bash
DB=$(grep DATABASE_URL .dev.vars | cut -d= -f2-)
psql "$DB" -c "
WITH active AS (
  SELECT DISTINCT b.id, b.title, b.author, b.title_cleaned,
         remove_spaces(b.author) AS norm_author,
         COUNT(r.id) AS reads
  FROM reads r
  JOIN books b ON b.id = r.merged_book_id
  GROUP BY b.id, b.title, b.author, b.title_cleaned
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
AND id1 NOT IN (SELECT variant_id FROM book_merge_exceptions)
AND id2 NOT IN (SELECT variant_id FROM book_merge_exceptions)
ORDER BY title1;"
```

## Step 2 — Dupe scan (run both methods)

Export active books once, then run both checks below.

### 2a — Programmatic (catches fullwidth/halfwidth + publisher suffix variants)

```bash
DB=$(grep DATABASE_URL .dev.vars | cut -d= -f2-)
psql "$DB" -t -A -F'|' -c "
SELECT DISTINCT b.id, b.title, b.author, COUNT(r.id) AS reads
FROM reads r
JOIN books b ON b.id = r.merged_book_id
GROUP BY b.id, b.title, b.author
ORDER BY b.title;" > /tmp/active_books.txt
wc -l /tmp/active_books.txt
```

Then run the dupe detector. Load current exceptions and already-merged variant_ids into the sets first.

```python
import unicodedata, re
from collections import defaultdict

def normalize(s):
    s = unicodedata.normalize('NFKC', s)  # fullwidth→halfwidth
    s = re.sub(r'[\s　\-・＝=_\[\]【】「」『』（）()［］<>《》〈〉〔〕{}。、.,!！?？~～…・/／\\]', '', s)
    return s.lower()

def strip_publisher(s):
    # strip trailing parenthesized publisher/catalog suffixes, e.g. "(講談社BOX)" "(角川文庫 か 1-2)"
    s = re.sub(r'\s*[\(（][^\)）]{2,20}[\)）]\s*$', '', s.strip())
    return s

books = []
with open('/tmp/active_books.txt') as f:
    for line in f:
        parts = line.strip().split('|')
        if len(parts) >= 3:
            books.append((int(parts[0]), parts[1], parts[2], int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 0))

# populate from book_merge_exceptions query + any ids merged this session
exceptions = set()  # variant_ids from book_merge_exceptions
merged_this_session = set()  # variant_ids already merged

groups = defaultdict(list)
for bid, title, author, reads in books:
    if bid in exceptions or bid in merged_this_session:
        continue
    key = (normalize(strip_publisher(title)), normalize(author))
    groups[key].append((bid, title, author, reads))

from datetime import date
out_path = f"/tmp/moemeter/dupes_{date.today()}.txt"

dupes = {k: v for k, v in groups.items() if len(v) > 1}
lines = []
for key, group in sorted(dupes.items(), key=lambda x: -max(b[3] for b in x[1])):
    lines.append("DUPE:")
    for b in sorted(group, key=lambda x: -x[3]):
        lines.append(f"  id={b[0]:>10}  reads={b[3]:>3}  {b[2]}  |  {b[1]}")
    lines.append("")

output = "\n".join(lines)
print(output)

import os; os.makedirs("/tmp/moemeter", exist_ok=True)
with open(out_path, "w") as f:
    f.write(output)
print(f"\nSaved to {out_path}")
```

**Do NOT flag:** different volumes, genuine 上/中/下 splits, different volume ranges (e.g. 1-45 vs 46-90), different editions with clearly different content.

### 2b — Visual (Explore agent, catches patterns the script misses)

Spawn an Explore agent on `/tmp/active_books.txt`. Look for same book registered twice due to:
- Fullwidth vs halfwidth: `（）` vs `()`, `！` vs `!`, `～` vs `~`, `　` vs ` `, `ＢＯＸ` vs `BOX`
- Bracket style: `[上]` vs `［上］`
- Digit style: `２` vs `2`, `Ⅱ` vs `II`
- Subtle title/author differences not caught by normalization

Pass the current exception variant_ids so the agent skips them. Merge the results from both 2a and 2b before presenting to user.

## Step 3 — Show list, wait for approval

Always present full list before merging. Never auto-merge.

Rule: **base** = higher reads. Tie → lower id = base.

## Step 4 — Run merges

```bash
DB=$(grep DATABASE_URL .dev.vars | cut -d= -f2-)
TOKEN=$(grep -i "jwt\|token\|bearer" .dev.vars | head -1 | cut -d= -f2-)
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
TOKEN=$(grep -i "jwt\|token\|bearer" .dev.vars | head -1 | cut -d= -f2-)
curl -s -X POST "http://localhost:8787/manual_book_merges/delete" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"variant_id": VARIANT}'
```

Expect `200`.

## Skip list

### DB-enforced exceptions (`book_merge_exceptions` table)

Always query live — do not hardcode. See Step 0.

### Hardcoded exceptions

- 嘘 id 5623590 (太宰治) vs 5788944 (新美南吉) — different authors
- 化物語 上/下 (ids 580220, 11072380, 580222, 11093014) — user managing separately; appear as exact dupes every run, always skip

## DB helpers

- `normalize_title(title)` — strips punctuation/spaces
- `remove_spaces(author)` — strips spaces from author
- `title_cleaned` — generated column on `books`, auto-normalized; **must be included in CTE SELECT** when used in joins
- `final_book_merges` view — auto merges + manual merges − exceptions

## Run history

| Date | Active books | Exact dupes | Visual dupes | Merged |
|------|-------------|-------------|--------------|--------|
| 2026-05-13 | 5,420 | 0 (化物語 上/下 skipped) | 18 (fullwidth+publisher suffix variants; 刀語 series, 空の境界, 猫物語, 雪国, etc.) | 18 |
