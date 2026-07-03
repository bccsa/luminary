# 14. Language selection in sync (set-based fallback keep, capped languages)

Date: 2026-07-03

## Status

Accepted

## Context

The app shows a **fallback translation** of a post when none of the user's preferred languages has
a published translation (the `mangoIsPublished` language-priority display selector). Until now that
fallback content reached the app through a **per-feed HybridQuery supplement**
(`fetchUnsyncedFallback` → `language: { $nin: syncedLanguages }`): every content feed on a page
(~4–5 per page) issued its own POST carrying the ordered O(L²) language-priority selector as an
**un-indexed residual scan**, re-issued on every navigation. Two problems:

- **API operating cost.** Heaviest for installed (full-sync) users, who would otherwise be
  Dexie-only — the fallback leg was what created their per-page API scans at all.
- **Delete/unpublish visibility bug.** `persistOffline` cached fallback content in IndexedDB, but
  the content **DeleteCmd** sync was filtered by `language: { $in: syncedLanguages }` while a
  content DeleteCmd carries the *deleted doc's own* language (`db.service.ts`). A fallback-language
  doc deleted or unpublished **while the user was offline** therefore never received its DeleteCmd
  on reconnect — it lingered in IndexedDB with `status: Published`, visible indefinitely.

Meanwhile the **live socket gate** (`isSyncableDoc`) already used a set-based priority-fallback
keep, so the REST backfill and the live path disagreed about what a client persists.

## Decision

Move fallback-language acquisition **into sync** and remove the per-feed supplement.

1. **Set-based language keep, shared by backfill and live gate.** The Content sync query keeps a
   doc iff `language ∈ syncedLanguages` OR (fallback) **none** of the synced languages has a
   published translation of that post (`$and` of negated `availableTranslations` `$elemMatch`).
   The clause is built by one helper — `shared/src/api/sync/keepSelector.ts`
   (`contentLanguageKeepSelector`) — used by both `syncBatch.ts` and `isSyncable.ts`, so the two
   paths agree. It is O(L) selector clauses; the keep is a residual filter on the existing
   `sync-content-index` time-window seek (no new index).

   The keep uses the **synced** set, not the preferred set: a *preferred-but-unsynced* language is
   deliberately **not** downloaded — the user sees the best synced/fallback translation instead
   ("download less" wins over full display fidelity for mid-rank preferred languages).

   For a post with **no** synced-language translation, the fallback branch matches **every** one of
   its translations (the branch is per-post, not per-doc, and has no ordering — exactly like the
   display selector's own fallback clause). This amplification is **accepted**: a post published
   exclusively outside the synced languages rarely carries more than one translation, and syncing
   the full candidate set means whatever the display layer later picks is present offline.

2. **CMS is exempt.** CMS content sync keeps the flat `language: { $in: allLanguages }` — it syncs
   every language, so the fallback branch would be vacuous and only bloat the selector. The
   language cap (below) also does not apply to `cms: true` queries.

3. **Content DeleteCmds are language-unscoped.** The DeleteCmd sibling column is created with
   `languages: undefined` and its sync query carries **no** language selector, so a delete of any
   downloaded doc — including a fallback translation whose DeleteCmd carries a non-synced language
   — propagates. DeleteCmds are tiny; all-language is cheap. A one-time `initSync` normalization
   strips `languages` off legacy scoped DeleteCmd entries so old columns converge (via vertical
   merge) instead of accumulating.

4. **The on-demand fallback supplement is removed.** `HybridQuery`'s `fetchUnsyncedFallback`
   option, `withPublishDateOrFallback`, and the combined `$or` supplement are deleted (the branch
   never shipped, so no deprecation window). `decideContentApiQuery` is back to the older-tail-only
   contract; installed (no-cutoff) clients are fully Dexie-only for content.

5. **Language caps, enforced at the API.** A user may pick at most **3 preferred** languages (the
   CMS default language is auto-appended for display only, not counted); the synced set is a subset
   of preferred, also ≤ 3, primary always included. The **authoritative** cap is the `/query`
   validator: a non-CMS query referencing more than `QUERY_MAX_LANGUAGES` (default **4** = client
   cap + auto-appended default) distinct `language`-field values is rejected with 400
   (`validateQuery.ts`, counted during the existing selector walk). The app enforces the same caps
   as normalization + UI guards (`globalConfig.ts` `normalizePreferredLanguages` /
   `normalizeSyncedLanguages`, `LanguageModal`), including capping over-limit persisted sets on
   load.

## Considered and not chosen

- **Porting the ordered `mangoIsPublished` selector into sync.** The ordered form is a *display*
  deduplicator (one best translation per post) and is O(L²) selector clauses — it would exceed the
  validator's `MAX_SELECTOR_CLAUSES=256` at ~11 languages and be rejected. Sync wants the candidate
  *set* (order is a display concern), which the set-based keep expresses in O(L). Note the ordered
  selector has no ordering for a post entirely outside the preference list either — its own
  fallback clause matches all of that post's translations, same as the sync keep.
- **Keep = preferred set (sync all preferred languages).** Would preserve display fidelity for
  preferred-but-unsynced languages, but collapses the "available offline" toggle into the preferred
  list and downloads more. Rejected in favour of the synced-subset keep.
- **A single "best fallback" per post.** Selecting exactly one fallback translation in the Mango
  query needs either the O(L²) ordered form over *all* languages (impossible under the caps, and no
  total language order exists) or a **server-computed per-post canonical-fallback marker** (new
  ContentDto field + DTO mirror + schema backfill). Deferred: the multi-translation fallback post is
  rare, and the accepted amplification is bounded. If it becomes a problem, the canonical-marker
  field is the path — it would also give the display layer a deterministic single fallback tile.
- **Keeping the on-demand supplement (do-less).** Covers everything a user views online, but leaves
  the per-feed API cost in place and does nothing for the DeleteCmd visibility bug; a
  reconnect-refetch variant was also designed and dropped once sync-inclusion was chosen (sync's
  head re-walk on reconnect delivers additions; unscoped DeleteCmds deliver removals).

## Consequences

- Installed clients issue **zero** per-feed content POSTs; browser-tab clients keep only the
  below-cutoff older-tail supplement. Fallback content is present **offline before it is ever
  viewed**, and deletes/unpublishes of it propagate on reconnect.
- A Content sync column is **no longer language-disjoint**: a column keyed on languages `L` also
  stores fallback docs with `language ∉ L`. Merge/trim key on the declared set, never on the docs'
  actual languages, so this is benign (documented at `SyncListEntry.languages` and the sync README).
- **Content browsing depends on sync.** HybridQuery's content route is local-read + older-tail
  delta only — there is no full API-only content fetch. A fresh install shows content once initial
  sync fills the window; a hypothetical "no content sync, stream-only" mode would need a new
  API-only content route (out of scope, evaluated and accepted).
- For the rare fallback-only post with multiple translations, **all** of them sync, and the display
  currently renders one tile per translation (no `parentId` dedupe in the feed pipeline). Accepted
  for now; a client-side dedupe with a deterministic tiebreak (or the canonical-fallback marker) is
  the follow-up if it surfaces in practice.
- Cross-package coupling: the app's preferred-language cap (3) and the API's `QUERY_MAX_LANGUAGES`
  (4) must move together — the +1 is the auto-appended CMS default. Documented at both constants.
- Backwards compatibility (ADR 0005): the keep `$or` is an additive client-side selector reshaping
  the server already accepts; older clients sending flat `$in` keep working. The language cap
  rejects only over-cap non-CMS queries — unreachable for clients enforcing the 3-language UI cap.
