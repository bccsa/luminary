#!/usr/bin/env python3
"""Rank the seeder's vocabulary by real trigram document frequency.

Reads the df of every trigram straight from `fts-trigram-index` (its `_count` reduce with
`group=true` yields one row per trigram), then applies the same pruning and floor rules as
`api/src/endpoints/ftsSearch.service.ts` to each word in `seed-corpus.ts`'s WORDS list.
This is how the pinned search terms (`message` / `habitat`) were chosen.

    python3 trigram-df.py luminary-perf-3k 3000

Needs DB_CONNECTION_STRING in api/.env.
"""
import base64
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

DB = sys.argv[1] if len(sys.argv) > 1 else "luminary-perf-3k"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3000
PRUNE_PERCENT = 50  # FTS_MAX_TRIGRAM_DOC_PERCENT
MIN_TRIGRAMS = 3  # FTS_MIN_TRIGRAMS
BUDGET = 3000  # FTS_CANDIDATE_ROW_BUDGET

ROOT = Path(__file__).resolve().parents[2]
env = (ROOT / "api" / ".env").read_text()
url = re.search(r'^DB_CONNECTION_STRING\s*=\s*"?([^"\n]+)"?', env, re.M).group(1).strip()
u = urlparse(url)
base = f"{u.scheme}://{u.hostname}:{u.port or 5984}"
auth = base64.b64encode(f"{u.username}:{u.password}".encode()).decode() if u.username else None


def get(path):
    req = urllib.request.Request(base + path)
    if auth:
        req.add_header("Authorization", "Basic " + auth)
    return json.load(urllib.request.urlopen(req, timeout=300))


rows = get(f"/{DB}/_design/fts-trigram-index/_view/fts-trigram-index?group=true")["rows"]
df = {r["key"]: r["value"] for r in rows}
prune = N * PRUNE_PERCENT // 100
print(f"{DB}: {len(df):,} distinct trigrams; pruned when df > {prune}")

src = (ROOT / "api" / "scripts" / "perf" / "seed-corpus.ts").read_text()
words = re.search(r"const WORDS = `(.*?)`", src, re.S).group(1).split()


def trigrams(w):
    w = w.lower()
    return [w[i : i + 3] for i in range(len(w) - 2)]


def plan(w):
    """Mirror the service: drop pruned trigrams, keep rarest-first with the min-trigram floor."""
    d = sorted(x for x in (df.get(t, 0) for t in trigrams(w)) if 0 < x <= prune)
    kept, budget = [], 0
    for x in d:
        if len(kept) >= MIN_TRIGRAMS and budget + x > BUDGET:
            break
        kept.append(x)
        budget += x
    return len(d), len(kept), budget


print()
for w in ("content", "rhythm", "message", "habitat"):
    marks = "  ".join(f"{t}:{df.get(t, 0)}{'✗' if df.get(t, 0) > prune else ''}" for t in trigrams(w))
    print(f"  {w:10} {marks}")

ranked = sorted(((w, *plan(w)) for w in words), key=lambda r: -r[3])
survive = [r for r in ranked if r[1] >= MIN_TRIGRAMS]
print(f"\nwords with ≥{MIN_TRIGRAMS} usable trigrams: {len(survive)}/{len(words)}")
print("\nmost expensive survivors (candidate rows = summed df of kept trigrams):")
for w, usable, kept, rows_ in survive[:6]:
    print(f"  {w:12} usable {usable}  kept {kept}  cand.rows≈{rows_:>5}")
print("\nleast expensive survivors:")
for w, usable, kept, rows_ in survive[-6:][::-1]:
    print(f"  {w:12} usable {usable}  kept {kept}  cand.rows≈{rows_:>5}")
