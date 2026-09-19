#!/usr/bin/env python3
"""Report the state of the FTS views on one or more CouchDB databases.

For each database: document count, update sequence, file size; for `fts-trigram-index` and
`fts-corpus-stats`: whether the updater or a compaction is running, the view's update
sequence against the database's, `sizes.file` / `active` / `external`, and the dead-space
share. Also lists `_active_tasks`, since ken (background indexing) and smoosh (auto
compaction) both show up there and both distort a measurement taken while they run.

    python3 couch-view-state.py luminary-perf-3k luminary-perf-15k luminary-perf-60k

Needs DB_CONNECTION_STRING in api/.env. Fauxton labels `sizes.external` as "Data size on
disk"; the file size is `sizes.file`, which only this route reports.
"""
import base64
import json
import re
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
env = (ROOT / "api" / ".env").read_text()
url = re.search(r'^DB_CONNECTION_STRING\s*=\s*"?([^"\n]+)"?', env, re.M).group(1).strip()
u = urlparse(url)
base = f"{u.scheme}://{u.hostname}:{u.port or 5984}"
auth = base64.b64encode(f"{u.username}:{u.password}".encode()).decode() if u.username else None
MB = 1e6


def get(path):
    req = urllib.request.Request(base + path)
    if auth:
        req.add_header("Authorization", "Basic " + auth)
    return json.load(urllib.request.urlopen(req, timeout=120))


tasks = get("/_active_tasks")
print(f"_active_tasks: {len(tasks)}" + ("" if tasks else "  (idle)"))
for t in tasks:
    print(f"  {t['type']:16} {t.get('design_document', ''):32} {t.get('progress', '')}%")

for db in sys.argv[1:] or ["luminary-perf-3k"]:
    info = get(f"/{db}")
    seq = int(info["update_seq"].split("-")[0])
    print(f"\n== {db}: {info['doc_count']:,} docs, update_seq {seq}, file {info['sizes']['file'] / MB:.1f} MB")
    for view in ("fts-trigram-index", "fts-corpus-stats"):
        v = get(f"/{db}/_design/{view}/_info")["view_index"]
        f, a, e = v["sizes"]["file"], v["sizes"]["active"], v["sizes"]["external"]
        lag = seq - v["update_seq"]
        print(
            f"  {view:18} updater={str(v['updater_running']):5} compacting={str(v['compact_running']):5} "
            f"lag={lag:<4} file {f / MB:7.0f} MB  active {a / MB:7.0f} MB  external {e / MB:7.0f} MB  "
            f"dead {100 * (f - a) / f if f else 0:4.1f}%"
        )
    total = get(f"/{db}/_design/fts-trigram-index/_view/fts-trigram-index")["rows"]
    if total:
        print(f"  trigram rows: {total[0]['value']:,}")
