# SSG reconnaissance: payload stripping and startup flashes

Date: 2026-09-14

## Scope and conclusion

Inspected local `main` at `b7ee01cb` and [PR #2053](https://github.com/bccsa/luminary/pull/2053) at `3a186924` (`2052-app-ssg-move-main-js-script-loading-after-static-data-to-increase-perceived-performance`).

There are confirmed design flaws behind the image and feed-content flashes. PR #2053 changes when the app starts; it does not fix the underlying state transitions.

The failure mechanisms were verified with focused tests and a DOM-mount comparison. No deployed browser session or Playwright run was performed. These findings establish the causes under the conditions described below, rather than claiming every observed flash has an identical cause. No generated `dist-web` output was available for a page-byte audit.

| Area | Finding |
| --- | --- |
| Payload stripping | The major heavy fields are stripped appropriately, but the payload is not fully minimal. |
| SingleContent image | The prerender fetches bucket URLs but does not serialize them for the client. |
| Homepage / Explore / Watch | An empty initial IndexedDB result replaces the SSG content seed before sync completes. |
| SingleContent stability | Its recovered snapshot protects the article, but also incorrectly shadows subsequent live updates. |
| PR #2053 | A startup-timing improvement, not a fix for these failures. |

## 1. Payload stripping

### What is correctly stripped

- **Overview feeds:** `text`, `fts`, `ftsTokenCount`, `memberOf`, and `_rev` are removed from the rendered query results and their cache seeds.
- **SingleContent:** the full live document is retained, but article text, FTS fields, and `_rev` are removed from the SSG seed. The article body is recovered from the static HTML, avoiding shipping it twice.
- **Sibling translations:** text remains in live results for language switching, but is removed from the cache.
- **Languages:** translation dictionaries are retained only for the rendered and default languages.

These distinctions matter. SingleContent reads `memberOf` for editing permissions, and offline persistence needs the full document. Applying overview stripping rules everywhere would be incorrect.

Evidence:

- [Content query stripping and SSR serialization](../app/src/composables/useContentQuery.ts), especially the default `stripFields` and SSR cache-write branches.
- [SingleContent query options](../app/src/pages/SingleContent/SingleContent.vue), especially the main article and sibling-translation queries.
- [Language serialization](../app/src/main.web.ts).
- [Article body recovery](../app/src/util/ssrTextRecovery.ts).

### Remaining avoidable data

- `initialState.langCodeToId` is serialized but has no application reader.
- `renderLangName` is diagnostic information, not required for rendering.
- Stripping uses exclusion lists, so unused fields such as `previousSlugs` survive when present.
- Documents are serialized independently per query; overlapping query results are not deduplicated.

**Verdict:** the largest reductions are sound. The page state is not fully minimal, but excessive stripping is not the cause of the image flash. Byte-saving estimates require generated pages and representative production data; none are asserted here.

## 2. SingleContent: image → fallback → image

### Root cause

The missing dependency is the storage bucket's public URL.

[useBucketInfo](../app/src/composables/useBucketInfo.ts) takes different prerender and client paths:

1. During prerender, it fetches storage documents and renders the correct image URL.
2. It does **not** write a response-cache entry or register one for page serialization.
3. The client requests a cached bucket query, but a fresh visitor has no bucket seed.
4. Without `bucketBaseUrl`, [LImageProvider](../app/src/components/images/LImageProvider.vue) produces an empty `srcset` and selects the fallback.
5. The bucket query resolves, and the real image returns.

This transition follows explicit rendering logic; it does not require an image-download error. The same missing dependency can affect feed images because they use the same image components.

### Verification

A focused test confirmed that prerender obtains the correct bucket URL while leaving both localStorage and the page's captured cache empty.

Existing bucket tests cover a warm client remount, which does not exercise this missing SSG handoff:

- [SSR bucket tests](../app/src/composables/useBucketInfo.ssr.spec.ts).
- [Client bucket tests](../app/src/composables/useBucketInfo.spec.ts).

### Required design correction

Include the bucket dependency in the initial client state using a matching client lookup contract. Delaying JavaScript does not supply the missing data.

## 3. Homepage, Explore and Watch: content disappears and returns

### Layer A: the installed client replaces the static DOM

The installed `vite-ssg` client creates the browser app with `createApp`, then calls `mount(..., true)`. Vue's `createApp` mount wrapper clears the container and performs a fresh render; the extra argument does not enable hydration.

This was verified by checking DOM identity: the existing node was removed. A `createSSRApp` control preserved it.

Evidence inspected in installed dependencies:

- `app/node_modules/vite-ssg/dist/index.mjs`: client uses `createApp(App)` and later `app.mount(rootContainer, true)`.
- `app/node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js`: the `createApp` wrapper clears `container.textContent` and calls the internal mount with hydration disabled.
- [The repository's vite-ssg patch](../app/patches/vite-ssg+0.23.8.patch) only closes the prerender's jsdom window; it does not change client mounting.

DOM replacement alone does not prove a visible white frame. The confirmed content gap comes from the data transition below.

### Layer B: an empty local read retires the SSG seed before sync completes

1. SSG serializes feed documents into the cache's `local` contribution.
2. The client synchronously restores those documents.
3. [clientRuntime](../app/src/ssg/clientRuntime.ts) initializes shared without `contentPublishDateCutoff`, selecting full-corpus sync.
4. [The cutoff default](../shared/src/config.ts) is `OPEN_MIN`, so [HybridQuery's routing decision](../shared/src/util/HybridQuery/queryIntrospection.ts) skips the API supplement.
5. An initial empty IndexedDB result replaces the seed. [Seed retention](../shared/src/util/HybridQuery/seedRetention.ts) only protects an empty local read while a remote supplement is pending.
6. Sync later supplies the documents, and the content returns.

**The design flaw is treating “configured to sync the full corpus” as “the local corpus is already complete.”**

The decisive replacement occurs in [HybridQuery `_setLocal`](../shared/src/util/HybridQuery/HybridQuery.ts). The SSG client waits for database initialization, but does not wait for initial network sync to complete before mounting.

Category-based pages amplify the effect: missing category or content results remove whole rows. `keepPreviousResult` does not protect against this accepted empty result.

Relevant consumers:

- [HomePagePinned](../app/src/components/HomePage/HomePagePinned.vue) and [HomePageNewest](../app/src/components/HomePage/HomePageNewest.vue).
- [PinnedTopics](../app/src/components/ExplorePage/PinnedTopics.vue) and [UnpinnedTopics](../app/src/components/ExplorePage/UnpinnedTopics.vue).
- [PinnedVideo](../app/src/components/VideoPage/PinnedVideo.vue) and [UnpinnedVideo](../app/src/components/VideoPage/UnpinnedVideo.vue).
- [Category grouping](../app/src/components/contentByTag.ts).
- [Collection visibility](../app/src/components/content/HorizontalContentTileCollection.vue).

### Verification

A focused test using the real HybridQuery reproduced:

```text
SSG-seeded document
  → empty local result, with no API supplement
  → empty output
  → later live local emission from sync
  → document restored
```

This is a Luminary data-lifecycle problem, combined with the installed SSG library's remount behavior. It is not an unavoidable property of SSG.

### Required design correction

The seed-to-live handoff must distinguish unfinished sync from an authoritative empty result. Seed retention cannot rely solely on whether an older-tail API request is pending. Correct deletion and permission behavior must still be preserved once authoritative data is available.

The mount strategy should also be reviewed explicitly: current comments describe hydration, but the installed client performs a remount. Switching mount mode alone would not prevent subsequent reactive empty results from removing content.

## 4. Why SingleContent appears stable—and its related defect

SingleContent reconstructs the article from its seed plus the static body and assigns it to `contentOverride`. That takes precedence over the live query, so an empty query cannot remove the recovered article.

However, the snapshot is not retired when fresh content arrives. The watcher clears `coldStartBackstop`, not `contentOverride`.

A focused component test confirmed both behaviors:

1. The recovered article survives an empty query result.
2. It continues displaying the old body after a newer live document arrives.

Evidence: [SingleContent](../app/src/pages/SingleContent/SingleContent.vue), particularly the `content` computed, snapshot recovery assignment, and `contentArr` watcher.

Its stability therefore comes with a stale-content defect. It is not yet a complete handoff pattern to copy to the feeds. A correction needs to distinguish the initial recovered snapshot from an intentional language-selection override and retire the snapshot when the matching authoritative document arrives.

## 5. Assessment of PR #2053

[PR #2053](https://github.com/bccsa/luminary/pull/2053) schedules entry execution after a rendering opportunity using `requestAnimationFrame` plus `setTimeout`, and preloads the entry bundle.

It changes none of the following:

- Bucket serialization.
- Seed retirement or sync-readiness semantics.
- Client mount mode.
- SingleContent snapshot handoff.

It may improve initial perceived performance, but **it should not be treated as resolving these flashes**. The underlying correction needs complete initial state and a handoff that distinguishes unfinished sync from an authoritative empty result.

## Validation and limitations

- **35 existing targeted tests passed** across the SSG cache contract, content stripping, bucket lookup, article-text recovery, and SingleContent retention tests.
- **Three focused reproduction tests passed:** missing bucket serialization, seed → empty → synced content, and recovered snapshot shadowing newer content.
- **DOM-mount comparison confirmed:** the installed client mount removes existing nodes; the hydration control preserves them.
- Temporary reproduction files were removed. Application source was unchanged by the investigation.
- No deployed-browser reproduction, Playwright run, or full SSG build was performed.
- Existing tests passing does not refute the findings: the existing cache-contract test checks the synchronous seed, the bucket test checks a warm remount, and the article recovery test checks initial reconstruction. They do not cover the failing handoffs demonstrated by the focused probes.

Memory-MCP was unavailable during the investigation, so repository inspection used the documented manual-search fallback.
