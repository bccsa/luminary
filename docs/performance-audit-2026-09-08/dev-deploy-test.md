# Validating the branch on dev — `api.dev.app.bcc.africa`

The branch (`1978-api-investigate-performance-issues`) can be deployed to dev to test
**§2 (id-list per-id fan-out)** against real data. §1 (tag index) is a client-side
change in `shared` and is **not** exercised by an API-only deploy — the tag A/B below
is only there to show no regression. #1818 is a separate PR.

## Procedure

```sh
# 1. BEFORE — capture the current dev state (already done, see dev-check-before.txt)
node docs/performance-audit-2026-09-08/dev-deploy-check.cjs | tee /tmp/dev-before.txt

# 2. Deploy the branch API to dev. If you can set env, also set:
#      PERF_TRACE=true
#    then the check script prints `finds=` and `examined=` from the X-Perf-Trace header.

# 3. AFTER
node docs/performance-audit-2026-09-08/dev-deploy-check.cjs | tee /tmp/dev-after.txt

# 4. diff /tmp/dev-before.txt /tmp/dev-after.txt
```

## BEFORE (current dev, 8 Sept 2026)

dev is a small, contended instance — absolute ms are noisier and higher than
prod/staging, and the p95s are wide. The scan *warnings* and the *ratios* are the
signal.

| shape | status | docs | ttfb p50 | ttfb p95 | scan warning |
| --- | --- | ---: | ---: | ---: | ---: |
| `_id:{$in}` ×25 | 200 | 25 | ~500–1050 ms | 2–4.7 s | **20/20** |
| `_id:{$in}` ×60 | 200 | 60 | ~480 ms | ~2 s | **20/20** |
| slug lookup (control) | 200 | 1 | 50 ms | 82 ms | 0/20 |
| single parentId (control) | 200 | 3 | 58 ms | 107 ms | 0/20 |
| empty incremental (control) | 200 | 0 | 38 ms | 96 ms | 0/20 |
| tag sync — generic index | 200 | 94 | 449 ms | 2 550 ms | 20/20 |
| tag sync — tag index | 200 | 94 | 288 ms | 607 ms | 0/20 |
| multi-parent `$in` +sort ×40 | **500** | 0 | — | — | — |

## Expected AFTER the branch deploys

| shape | expected change |
| --- | --- |
| `_id:{$in}` ×25 / ×60 | **~500 ms → tens of ms**, scan warning **20/20 → 0/20**, identical `hash`. With `PERF_TRACE=true`: `finds=25` / `finds=60`, `examined` ≈ the id count (not thousands). |
| all three controls | unchanged |
| tag sync A/B | unchanged — §1 is a client (`shared`) change, not in the API |
| multi-parent sorted | still HTTP 500 — needs #1818 |

If the id-list rows don't move, the branch didn't actually deploy, or the fan-out cap
(`MAX_ID_FANOUT = 100`) was exceeded — the ×25 and ×60 shapes are both under it.

## Environment comparison (all anonymous, current deployed code, 8 Sept)

| shape | dev | staging | production |
| --- | ---: | ---: | ---: |
| `protected` floor | 11 ms | 12 ms | 13 ms |
| tag sync — generic (scan) | 435–449 ms | 447 ms | 450 ms |
| tag sync — tag index | 110–288 ms | 129 ms | 107 ms |
| `_id:{$in}` scan | ~490 ms (spiky) | ~430 ms | ~490 ms |
| multi-parent sorted | HTTP 500 | HTTP 500 | HTTP 500 |
| post sync ×100 | 617 + 116 ms | 202 + 83 ms | 197 + 103 ms |
| fts-common | 669 ms | 290 ms | 592 ms |

The scan costs line up across all three environments — same data volume, same query
shape. dev's post-sync is heavier because its anonymous identity has broader access
(only 6 unmeasured shapes vs 27 on prod/staging), so the post-content queries touch
more docs. dev's tag-index number is noisy (110–288 ms across runs) from instance
contention, but the generic-index scan is a stable ~440 ms everywhere.
