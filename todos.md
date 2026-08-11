# Todos — SSG build & hydration fixes

Two related bugs surfaced from the SSG/ISR work on this branch. Fix one by one
(not all in one session). Task #2 likely collapses into Task #1, but keep them
separate until #1 is verified.

---

## Task #1 — Fix jsdom localStorage QuotaExceededError during SSG build ✅ DONE

**Symptom:** Build log shows repeated `DOMException [QuotaExceededError]: The
5000000-code unit storage quota has been exceeded` interspersed through
`dist-web` page writes (each page ~125–142 KiB). jsdom's polyfilled
localStorage enforces a synthetic 5,000,000 UTF-16 code-unit cap emulating real
browser quotas.

**Root cause (confirmed):**
`useContentQuery.ts`'s SSR branch (`useContentQuery.ts:227-252`) writes a full
response-cache payload to localStorage **unconditionally**, ignoring the `cache`
option entirely. `cache = false` is destructured but never checked in the SSR
branch — only the client branch respects it.

So every `useContentQuery` call on a page writes to localStorage during
prerender, even calls that explicitly pass `cache: false` specifically to avoid
seeding the cache. Example: `RelatedContent.vue`'s 50-doc `contentDocs` query
and its tags query — both deliberately uncached per their own comments, since
nothing on the client ever reads that seed back.

A page like `SingleContent.vue` fires 5+ `useContentQuery` calls (content,
translations, tags, `RelatedContent`'s `contentDocs`, `ReadMore`'s `tagDocs`),
each writing dead data that's cleaned up moments later in `onPageRendered`. But
the write already happened — and it's that **peak mid-render size** that blows
the quota, not a slow leak (a prior fix already handles the leak).

**Fix:** Gate the `writeResponseCache`/`reportCacheEntry` block in the SSR
branch behind `if (cache) { ... }`, matching client-branch behavior and the
intent already documented in the surrounding comments.

**Verify:** Rebuild SSG; confirm no more `QuotaExceededError` in the log and all
pages still write their legitimate `cache: true` seeds.

**Resolved:** Gated the `writeResponseCache`/`reportCacheEntry` block in the SSR
branch of `app/src/composables/useContentQuery.ts` behind `if (cache)` (left
`reportKeys` unconditional — it feeds the ISR dependency manifest, not the cache
seed). Type-check clean; `useContentQuery.spec.ts` 8/8 pass. SSG rebuild + quota
check pending (user-owned). Per Task #2 candidate #1, check whether the 404
flash also clears once this rebuilds.

---

## Task #2 — Investigate 404 flash for logged-out visitors (hqcache seed likely missing)

**Symptom:** User reproduced the `SingleContent.vue` hydration 404-flash again
while **not logged in**: the SPA briefly flashes not-found right after hydrating
from the SSG-prerendered HTML, then the real content appears. Ruled out: this is
**not** a Cloudflare/R2-level 404 — confirmed client-side hydration behavior.

**Working theory:** The `hqcache:*` response-cache seed for that route was
missing/invalid in the prerendered HTML at hydration time.

Mechanism that breaks: `SingleContent.vue`'s content query uses
`cache: true` + `cacheId: props.slug`, so `contentArr.value` should populate
synchronously from the seed inlined via `hqCacheScript()`
(`vite.config.web.ts:61-65`) **before** first client render — that's what keeps
`isLoading`/`is404` agreeing with SSR output. If the seed's absent,
`content.value` starts `undefined` client-side → brief not-found flash → live
query resolves → repaints correctly.

**Candidates to check, in priority order:**

1. **Same root cause as Task #1.** If `writeResponseCache` throws mid-render from
   the quota being hit, the article's *own* seed write could itself fail, or get
   silently dropped by the inline script's `try{}catch(e){}`
   (`vite.config.web.ts:64`) with no build-time error surfaced. **Likely fixing
   Task #1 fixes this one too.** Check this first after Task #1 lands.
2. **SSG_CONCURRENCY bookkeeping.** A scoped/incremental rebuild not correctly
   carrying the route-keyed cache-seed bookkeeping under `SSG_CONCURRENCY` — same
   shape as the dependency-collector bug fixed earlier this session. Worth
   re-checking for the cache-seed path specifically.
3. **"Not logged in" as red herring.** Confirm whether it also reproduces logged
   in — the permission-injected query path differs, which could change what gets
   seeded.

**To confirm:** Get the exact slug, check whether its `dist-web` HTML actually
contains a `hqcache:*` entry for its cache key, cross-reference against any
`QuotaExceededError` logged during that page's build.