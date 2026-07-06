# 15. Remain on CouchDB; fix query/index performance in place

Date: 2026-07-06

## Status

Accepted

## Context

CouchDB's server-side indexing and `/query` performance for a handful of hard-to-index
query classes prompted an evaluation (issue #1700) of migrating the backend off CouchDB to
the open-source **DocumentDB** stack (`pg_documentdb`, PostgreSQL-backed, MongoDB Query
Language; FerretDB 2.x as the proxy). This ADR records the outcome of that evaluation and,
because it was previously only implicit, the scaling strategy that constrains the decision.

### The scaling strategy (previously implicit)

At project start we chose a **low-cost, cloud-agnostic scaling strategy**, realised through
CouchDB **multi-master replication**. This gives us three properties at once:

- **Homogeneous, self-contained nodes** (DB + API) runnable on any commodity VM, any cloud,
  or on-prem.
- **Scale = add another peer** — no central write bottleneck, nothing forced to be made HA
  and scaled vertically.
- **Cloud-agnostic by construction** — no managed data service in the critical path.

Multi-master itself was never the requirement; it is the *mechanism* for those goals. But
in the open-source field it is close to the only mechanism that hits all three at once:
CouchDB is **Apache-2.0 with multi-master replication included**. The usual alternative,
Couchbase, does not qualify — Couchbase Server is **BSL 1.1** (source-available, not OSI
open-source) and its multi-master feature (XDCR) is Enterprise/commercial only.

### What the evaluation found

The full research is in issue #1700. In summary:

1. **The migration is not a driver swap — it is a scaling-architecture redesign.** Our
   scaling model rests on two CouchDB primitives the open-source DocumentDB stack does not
   provide.

2. **Document structure and the client edge are *not* the obstacle.** `_rev` can be dropped
   (we never use CouchDB revisions for conflict logic), `_id` maps directly, and every field
   clients depend on (`updatedTimeUtc`, `memberOf`, `parentType`, `availableTranslations`,
   `fts`, `ftsTokenCount`, …) is our own application data. The client sync cursor is the
   `updatedTimeUtc` document field queried in time windows — **no CouchDB sequence numbers
   appear in the client protocol**, so any redesign is contained to the server tier.

3. **The `_changes` feed is load-bearing for three things:** the live-query firehose
   (`HybridQuery` → Socket.io room fan-out), per-instance `PermissionSystem` cache coherence,
   and — critically — it sits *on top of* multi-master replication, which is how an instance
   learns about writes that replicated into its local DB from elsewhere.

4. **Open-source DocumentDB / FerretDB lacks both primitives.** No change streams
   (`watch()` is not in `pg_documentdb` or FerretDB 2.x as of 2026; it exists only in the
   *managed* Azure service) and no multi-master replication (Postgres is single-primary).
   A viable topology exists — central-primary DocumentDB + read replicas + a durable ordered
   event log (Kafka/NATS/Redis Streams) replacing both the change feed and inter-instance
   replication — but it **trades the homogeneous cheap-peer model for a central write
   primary that must be HA'd and scaled vertically, plus a second stateful distributed
   system to operate.** Net effect on "low-cost" and operational simplicity is negative.

   DocumentDB's genuine strengths (strong MQL compatibility for the operators we use;
   favourable MIT/Apache/Linux-Foundation licensing) address a **query-layer** problem —
   they do not offset the loss of the scaling profile.

5. **Full-text search is already solved and does not motivate a move.** Luminary uses its
   own trigram-based FTS with BM25 scoring — indexed server-side (`api/src/util/ftsIndexing.ts`)
   and searched client-side over Dexie (`shared/src/fts/ftsSearch.ts`), so it works **offline**
   (ADR 0009). This is a deliberate advantage a server-side engine (CouchDB Nouveau, or
   DocumentDB `$text`) would not replicate, and it means FTS is *not* one of the "hard-to-index"
   query classes to solve at the DB layer.

The decisive question therefore is not "is multi-master required" but **"are we willing to
revisit the low-cost, cloud-agnostic scaling strategy itself?"** The answer is no.

## Decision

**Remain on CouchDB.** We will not re-platform to DocumentDB. The migration would solve a
query-layer problem by paying with the scaling architecture, and the low-cost, cloud-agnostic
scaling strategy above is a binding constraint that DocumentDB's open-source stack cannot meet.

We address the server-side indexing/query-performance concerns **within CouchDB**:

- **Index-design audit** — ensure no hot `/query` path falls back to an unindexed scan;
  continue using partial indexes (`partial_filter_selector`) where selective.
- **Extend server-side response caching** for hard-to-index query classes, building on the
  mechanism introduced in ADR 0011 (server-side response caching for content queries).

We explicitly **do not** adopt CouchDB Nouveau: our offline-compatible trigram FTS already
covers full-text search, and Nouveau is a server-side engine that would not work offline.

Re-platforming stays on the table only if the scaling strategy itself is deliberately
revisited — that is a separate, explicit strategy decision (a new ADR), not something to be
backed into via a migration.

## Consequences

- The **scaling strategy is now recorded**, not implicit: future proposals that would
  introduce a central write primary or a managed data service in the critical path are
  measured against this ADR.
- Performance work is scoped to CouchDB (index-design audit + response caching), a smaller,
  lower-risk effort than a re-platform, with **no client/`shared/` protocol changes** — the
  `updatedTimeUtc` cursor is already engine-agnostic.
- We accept CouchDB's known ergonomic costs (Mango's limited query planner, manual
  design-doc index management) as the price of the scaling profile, and mitigate them with
  caching and disciplined index design rather than an engine change.
- If the scaling strategy is ever revisited, this ADR is superseded by a new one recording
  the central-primary-plus-event-log topology and its accepted trade-offs; the server-tier
  migration scope is catalogued in issue #1700.

## Related

- ADR 0002 — Monorepo (server tier is `api/`, the only affected package here).
- ADR 0005 — Backwards compatibility (client protocol unaffected either way).
- ADR 0009 — Server-side FTS indexing (our offline trigram FTS; why Nouveau is not needed).
- ADR 0011 — Server-side response caching for hard-to-index content queries (the in-place perf lever).
- ADR 0012 — CMS reactive reads via HybridQuery (a live-query consumer of the change feed).
