# Phase 2 — Render-Time Dependency Tracking & Event-Driven Regeneration

**Status:** Validated in POC ✓
**Delivers:** The ability to compute **exactly which prerendered pages go stale**
when content changes, and to **regenerate only those pages** — driven
automatically by **change events**, not manual rebuilds.

**Depends on:** Phase 1 (a prerendered page that is a faithful function of the
data it read).

---

## 1. Objective

Treat every prerendered page as a **cache keyed by the data it read at render
time**. When data changes, intersect the change with those keys to get the
**minimal set of stale pages**, and regenerate only that set.

## 2. Problem this solves

Real content pages are not islands. They contain **query-driven sections** —
"related content", "newest", "popular", "in this group", homepage feeds — that
display *other* items. So a single edit fans out: change one item's title and
**every page that shows that item in a list goes stale**, plus any feed it
appears in. Without dependency tracking you must choose between:

- rebuilding the **whole site** on every change (wasteful, slow), or
- rebuilding **too little** and serving stale pages.

Dependency tracking gives you the **exact** stale set, which is the prerequisite
for affordable incremental regeneration.

## 3. Core concepts & required patterns

### 3.1 A page is a cache keyed by what it read

Model each render's data reads as a set of **coarse dependency keys**. Coarse on
purpose — track membership/identity, not individual fields:

- an **identity** key per content item (e.g. `doc:<id>`)
- a **grouping/collection** key per category or topic an item belongs to
- a **feed/query** key per dynamic list (e.g. newest, pinned, by-category)

**Make keys language- / locale- / tenant-scoped** so a change in one scope never
invalidates pages in another (e.g. an edit to an English item must not mark a
French page stale). Scope is encoded *into* the key.

### 3.2 Genuine render-time capture (not a guess)

The dependency set must reflect what each page **actually read**, captured *while
it renders*:

- Each API/query response **declares the keys it touched** (e.g. via a response
  header or returned metadata).
- During prerender, a **per-page collector** records the keys reported while that
  page renders, and the build writes a **route → keys manifest**.
- Render pages **one at a time** (serialized) so a single shared collector
  attributes keys to exactly one page. (Or use a render-scoped collector — the
  requirement is unambiguous attribution.)

This is the crucial property: the manifest is **observed**, not inferred from a
static analysis or a developer's mental model.

### 3.3 Mutations declare the keys they changed

Every content mutation (create / edit / delete / **re-categorize**) returns the
**set of keys it changed**. Subtleties that must be handled:

- A **re-categorization** affects **both the old and the new** grouping keys
  (union), plus any collection-count/feed keys.
- An edit that changes an item's **card display** (title, summary, image)
  affects every grouping/feed the item appears in, because those pages render
  the card.
- Add/delete affects the item's identity key, its groupings, the feeds it
  enters/leaves, and any "counts" keys.

### 3.4 Compute the stale set (fan-out)

The stale set = **every route whose recorded keys intersect the changed keys**,
plus the item's own page for a newly added item not yet in the manifest. The
**fan-out factor** (stale routes ÷ total routes) is a real, measurable cost — and
it is often large (a single change touching a meaningful fraction of the site),
which is precisely why you must compute it rather than guess.

> Provide a **non-destructive "what would change?" simulation** path so tooling
> can ask "if I edited this item, what goes stale?" without mutating state. It
> reuses the exact mutation logic.

### 3.5 Regenerate only the stale set

Regenerate **only** the computed routes, leaving every other page in place, and
**merge** (not replace) the dependency manifest for the regenerated routes.
**Verify isolation by content hash**: only the intended files' bytes change.

> A **scoped rebuild** (re-running the prerender for a small route subset) is an
> acceptable v1. True single-page/edge regeneration is an optimization, **not**
> required — see Non-goals.

### 3.6 Event-driven regeneration loop

Close the loop so regeneration is automatic:

1. **Change event source** — when data changes, the backend **emits an event**
   carrying the changed keys (the POC used Server-Sent Events; a webhook/queue
   works too).
2. **Watcher** — a long-running process subscribes, **debounces and coalesces**
   bursts of keys, computes the stale set, and triggers a scoped regeneration.
   Regenerations are **serialized** (never overlap); keys arriving mid-build are
   queued into the next run.
3. **Serve** — the regenerated static files are published (to the CDN/bucket);
   purge the affected paths from the edge cache so nodes refetch.

The event source and the watcher are decoupled, so the same loop works locally,
in a container, or as a hosted service.

## 4. What to build (by responsibility)

- A **key vocabulary** + key constructors (the single source of truth for what a
  key means), scoped by locale/tenant.
- A **capture mechanism**: responses report keys; the prerenderer records
  per-route keys into a manifest.
- **Mutation logic that returns changed keys**, including the union rules above,
  plus a **non-destructive simulation** entry point.
- An **affected-set computation** (intersect changed keys with the manifest).
- A **scoped regeneration** mechanism with content-hash verification and manifest
  merge.
- An **event source** + a **debounced, serialized watcher** that runs the
  regeneration and triggers cache purge.

## 5. Acceptance criteria

1. After a full build, a **route → dependency-keys manifest** exists and reflects
   the query-driven sections each page actually rendered.
2. Editing an item and asking the tool for the stale set returns **the item's
   own page plus every co-listed/co-grouped page and affected feed** — and
   **nothing in another locale/tenant scope**.
3. A **re-categorization** marks **both** the old and new grouping keys' pages
   (and the counts/feeds) stale.
4. Scoped regeneration changes **only** the stale files (proven by content hash);
   all other pages are byte-identical.
5. The **event loop** turns a content mutation into an automatic scoped
   regeneration with no manual step, and overlapping changes are coalesced, not
   raced.

## 6. Key decisions & rationale

- **Coarse, scoped keys.** Fine-grained per-field tracking explodes complexity
  for little benefit; coarse keys capture the real fan-out cheaply. Scoping keys
  is what prevents cross-locale/tenant over-invalidation.
- **Observed capture over inferred.** The manifest must be what pages *read*, or
  it will silently drift from reality.
- **Serialized, debounced regeneration.** Content bursts are normal; coalescing
  and serializing keeps regeneration correct and bounded.

## 7. Pitfalls / gotchas learned

- **Forgetting the old∪new union on re-categorization** leaves the old grouping's
  pages stale. This is the most common correctness bug.
- **Parallel rendering with a shared collector** mis-attributes keys. Serialize
  or scope the collector.
- **Edge cache not purged** after regeneration → users keep seeing old pages even
  though the bucket is updated. Purge the affected paths; never purge the whole
  zone reflexively.
- **The fan-out is bigger than intuition suggests.** Measure it; it argues for
  keeping groupings small and feeds bounded.
- **Deletion is not just regeneration — it must also *remove* the page.** A scoped
  rebuild *re-renders* the stale set but does not delete files, so a deleted item
  vanishes from feeds/lists but its **own page lingers** unless you explicitly
  delete it (and purge that path). Handle delete as: regenerate the affected set
  **plus** remove the deleted item's own page.
- **A change event is only a trigger — the watcher must be running to act on it.**
  Emitting the event does not, by itself, rebuild anything.

## 8. Production hardening (we DO want this — just not fully in the POC)

- Write a **real `dateModified`** for each regenerated page (feeds Phase 1 SEO).
- **Targeted edge-cache purge** integrated into the publish step.
- A **fan-out report** to monitor regeneration cost over time.

## 9. Non-goals — do NOT build these

- **Do NOT build a true per-route / single-document live regeneration engine for
  v1.** A scoped rebuild of the stale subset is sufficient and was deliberately
  chosen. Treat single-page/edge regeneration as a *later optimization*, only if
  measured cost demands it.
- **Do NOT track fine-grained, per-field dependencies.** Keep keys coarse.
- **Do NOT let private / group-scoped / per-user data enter this dependency
  graph.** That data is never prerendered and must carry **no** dependency keys
  (see Phase 3). The manifest is for the public tier only.
- **Do NOT block content writes on regeneration.** Mutations return their changed
  keys and the regeneration happens asynchronously off the event.

## 10. Reference implementation note

The POC captured keys via an `X-SSG-Deps` response header read only during the
build, wrote a `route → keys` JSON manifest, returned `changedKeys` from each
mock-API mutation, computed the affected set by intersecting with the manifest,
regenerated via a scoped prerender (verified by SHA hash), and drove it all from
an SSE event stream consumed by a debounced watcher. All of this is
framework-neutral; the only hard requirements are *observed* capture, *scoped*
keys, *union-correct* mutations, and a *serialized* regeneration loop.
