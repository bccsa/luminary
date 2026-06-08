# Phase 3 — Two-Tier Data, Offline & Multi-Platform Delivery

**Status:** Validated in POC ✓ (data tier + sync + offline-from-cache); platform
delivery is a **decided architecture**, partially prototyped.
**Delivers:** Private, **group-scoped** data alongside the public SEO tier;
**offline** support where it belongs; and a clean **web / mobile / desktop**
split from one codebase.

**Depends on:** Phase 1 (clean hydration rule), and is independent of Phase 2
(the private tier is deliberately *outside* the regeneration system).

---

## 1. Objective

Support data the user may only see based on **access (group/tenant) membership**,
and make the app usable **offline**, **without** compromising the public,
crawlable tier — and deliver the same app to **web, mobile, and desktop** with
offline living only where it can actually work.

## 2. The two data tiers

| | **Public tier** | **Private / group-scoped tier** |
| --- | --- | --- |
| Audience | everyone (incl. crawlers) | authenticated members of a group/tenant |
| Prerendered? | **Yes** (Phase 1) | **Never** |
| In CDN/static HTML? | Yes | **Never** (CDN files are world-readable) |
| In the hydration snapshot / initial state? | Yes | **Never** (per-user) |
| In the Phase-2 dependency graph? | Yes | **No** — carries no dependency keys |
| Cached where? | the prerendered HTML / edge | **client-side store (e.g. IndexedDB)** |
| Has SEO value? | Yes | No (and must not) |

**Why "never prerendered" is a security boundary, not just an optimization:**
static files served from a CDN are public and cacheable. Baking one group's data
into them would expose it to everyone, and prerendering per-group would explode
combinatorially. Private data is therefore **always** fetched at runtime by an
authenticated client and **never** written to a shared artifact.

## 3. Core concepts & required patterns

### 3.1 Where private data renders (two valid placements)

Private data can surface in **two** ways, and both keep it out of the prerendered
output:

1. **Dedicated client-only routes** (e.g. a workspace / dashboard) — excluded from
   prerendering, served via the host's SPA fallback, rendered entirely in the
   browser after the session is known. Mark them `noindex`.
2. **Interleaved into otherwise-public, prerendered pages** — e.g. group-scoped
   tiles mixed into a homepage / explore feed, or private items inside an
   article's "related content" / single-content component. The page is *still*
   prerendered (public baseline, for SEO); the private items are layered in
   **after mount** (see 3.2).

In both cases the private content is **never** in the prerendered HTML, the state
snapshot, or the dependency manifest.

### 3.2 The clean-hydration rule, applied to per-user data

This is Phase 1's rule doing its real work. The shared app shell is prerendered
**signed-out / public** (the safe baseline the static HTML embeds). Then, **after
mount**:

1. resolve the session (who the user is, which groups/tenants they belong to),
2. fetch the private records those grants allow,
3. **layer them in as a post-mount reactive update**, and cache them locally.

**Never** put session, auth, or group data into the hydration snapshot, and
**never** render auth-dependent shell UI during the hydrating render — render the
signed-out state first (matching the credential-less server output), then update.
Otherwise you reintroduce hydration mismatch *and* risk leaking per-user state
into shared files.

**Mixing private content into a public prerendered page** (the common case — feeds,
explore, related-content / single-content components) follows the same rule and
does **not** conflict, because the private items are absent from the *hydrating*
render. Hydration is a one-time reconciliation at mount; anything that changes
state *after* mount is normal reactivity, which the framework applies by patching
the DOM — not a hydration step, so it cannot mismatch.

- The list renders from `[...public, ...private]`. `public` comes from the
  snapshot (present at first paint); `private` is **empty during SSR and the first
  client render** — it is not in the snapshot and is fetched only after mount once
  the session resolves → the first client render equals the server's → clean
  hydration. The private items then merge in as a normal post-load update.
- Make it bulletproof: gate the private portion on a **post-mount flag /
  client-only wrapper** (false during SSR + first paint), and give every item a
  **stable, globally-unique key** (prefix private keys, e.g. `grp:…` vs `pub:…`)
  so the merge diffs in place — public items stay mounted, private items insert,
  no flash.
- **The one anti-pattern that breaks it:** reading the session during SSR or
  synchronously *before* mount (e.g. session-from-cookie at render time). Then the
  server (no session) and the first client render (session) diverge → mismatch.
  Session resolves **after mount only**.

Keep two concerns separate: **correctness** (no mismatch — solved above) vs the
**visible "pop" / reorder** when private items merge into a public list. The pop
is *intended* post-hydration behaviour, not a bug; if a chronological interleave's
reorder is undesirable, append the private items as their own section instead of
interleaving. (On the native shells there is no prerender/hydration at all, so this
is purely a web-tier concern.)

### 3.3 Client-side sync + local cache

- Fetch private records scoped by the user's grants (the server resolves
  membership → records; the client sends only its identity/token).
- **Cache them in a real client store** (IndexedDB or equivalent) so the data is
  available without re-fetching and across reloads.
- **Render from the cache; fall back to it when the API is unreachable.**
- **Clear the cache on sign-out** so private data isn't left at rest.

### 3.4 Offline — what actually works, and what doesn't

Be precise; this is widely misunderstood:

| Situation | Works? | Why |
| --- | --- | --- |
| App already loaded → lose network → navigate, read cached data | ✅ | JS is in memory; the local store is on-device |
| **Cold start / refresh / reopen while offline** | ❌ on the web | the browser must fetch the shell (HTML/JS/CSS) from the network, which fails |

Two truths that follow:

- **Hydration/JS "taking over" is necessary but not sufficient for offline.** It
  only proves the app runs *once downloaded*. Offline-first is about *launching
  with no network*.
- **The HTTP cache is not an offline mechanism.** It is evictable and
  freshness-bound; top-level navigations go to the network and fail closed; HTML
  is normally served `no-cache`. Only a **service worker** (web) or a **bundled
  native shell** can deterministically serve the shell offline.

### 3.5 The platform split (the decided architecture)

Offline is provided by **putting the app shell on the device**, which only the
native shells do. Therefore:

| Surface | Role | Offline | Service worker? |
| --- | --- | --- | --- |
| **Web** (CDN-hosted prerender) | SEO / discovery / acquisition funnel | **No — online only** | **None** |
| **Mobile** (native WebView wrapper, e.g. Capacitor) | full app | **Yes** — shell bundled in the binary, data in local store | None |
| **Desktop** (downloadable app) | full app | **Yes** — shell bundled | None |

- The web page shows a **"Download" call-to-action** (OS-detected) linking to the
  installer, turning SEO discovery into an install.
- **Desktop is not a native target of the mobile wrapper** by itself — produce a
  desktop build via a desktop wrapper that bundles the same SPA (the POC noted a
  community Electron integration, or a lighter Rust-based wrapper, as the two
  options; choose per binary-size vs plugin-reuse trade-off).
- **No service worker anywhere.** The web stays online-only (always fresh, no
  cache-staleness, no conflict with the native WebView runtime); the native
  shells provide offline by bundling.

### 3.6 Update & staleness lifecycle (for the native/offline surfaces)

Offline necessarily means "**run the last-known-good code until you can
update**." Manage it, don't fear it:

- **Serve cached/installed now; update in the background; apply on next launch**
  (or prompt "new version available"). This is *stale-while-revalidate* for a
  service worker, and **OTA / app-store update** for native shells.
- **Cache the shell as an atomic, content-hashed set** so you never get
  "new HTML + old JS." Each deploy is one consistent set; the swap is atomic.
- **Separate code-version from data-version.** The shell (code) may lag by one
  launch; the **content/data stays current** because it syncs into the local
  store whenever online. Staleness applies to code, not content.

### 3.7 Local-storage durability caveat

Client stores (especially IndexedDB under some mobile WebViews) can be **evicted
under storage pressure**. For data that must survive, back it with the platform's
durable/native storage (e.g. a native SQLite/secure store) or request persistent
storage where available — don't assume IndexedDB is permanent.

## 4. What to build (by responsibility)

- An **access-control resolver** server-side: identity → groups/tenants →
  permitted records. Private endpoints return **no** cache headers for shared
  caches and **no** dependency keys.
- A **session layer** (per-user, kept out of the hydration snapshot, restored
  after mount).
- A **client sync + local-cache layer** (fetch scoped records, persist, render
  from cache, fall back offline, clear on sign-out).
- **Client-only private routes** marked `noindex`.
- **Build/packaging targets**: web (prerendered, online-only) and one or more
  **native bundles** that ship the shell on-device.
- A **download/install funnel** on the web surface.
- An **update channel** for the native shells (store and/or OTA).

## 5. Acceptance criteria

1. Two different users see **different private records** on the same route,
   according to group membership; an unauthenticated request is rejected.
2. **No private data appears in any prerendered/static file, the hydration
   snapshot, or the dependency manifest.** (Grep the build output — it must not
   be there.)
3. The shared shell **hydrates cleanly** (Phase 1 criteria still pass) with the
   private tier present — private UI appears only **after** mount.
4. A **public, prerendered page that interleaves private content** (a feed,
   explore page, or related-content component) hydrates with **zero mismatch
   warnings**: the prerendered HTML and the first client render contain only the
   public items; the private items appear post-mount as a normal update.
5. Private data **persists in the local store** across reloads and renders from
   cache when the API is unreachable; it is **cleared on sign-out**.
6. A **native build launches and is usable with the network disabled** from a
   cold start (the web build, by design, does **not** — and that's expected).

## 6. Key decisions & rationale

- **Two tiers, no overlap.** Public content is what we want everyone to find;
  private content has no SEO value. Because they don't overlap, neither has to
  compromise for the other (no "publicly indexable yet private" tension).
- **Offline belongs to the native shells, not the web.** It's the only place the
  shell can be on-device without a service worker.
- **No service worker.** Keeps the web always-fresh and avoids conflicts with the
  native WebView runtime — a deliberate trade of "offline web" for "simple,
  conflict-free web + always fresh."

## 7. Pitfalls / gotchas learned

- **Mistaking "JS hydrates" for "works offline."** It doesn't; see 3.4.
- **Mistaking the HTTP cache for offline support.** It isn't; see 3.4.
- **A direct hit / refresh on a client-only route flashes the public fallback**
  (e.g. the home page) before the client renders the right route — and with **JS
  disabled it stays** on that fallback (which is the correct crawler behavior,
  but confusing during development). **Fix: serve a content-less shell for
  client-only route prefixes** so there's nothing to flash or mistake. This is
  also the host fallback config you'll need on the CDN.
- **Leaving private data in the local cache after sign-out.** Clear it.

## 8. Production hardening (we DO want this — just not fully in the POC)

- **Content-less shell fallback** for client-only routes (kills the flash and the
  JS-disabled confusion; required CDN fallback config anyway).
- **OTA update channel** for the native shells.
- **Durable storage** for critical offline data (native store / SQLite).
- Token/session refresh and a clean offline-then-online **reconciliation** UX for
  divergent local vs server data.

## 9. Non-goals — do NOT build these

- **Do NOT add a service worker to the web tier.** This is the single most
  important constraint. The web is **online-only** by decision.
- **Do NOT try to make the web build work offline** (no app-shell precache, no
  PWA-install-for-offline on web). Offline = native shells only.
- **Do NOT prerender, CDN-cache, or otherwise write private/group-scoped data
  into any shared artifact**, snapshot, or dependency manifest.
- **Do NOT put auth/session/group/offline state into the hydration snapshot**, or
  render it during the hydrating pass.
- **Do NOT expect the mobile native wrapper to emit a desktop executable** — use
  a dedicated desktop wrapper for that.
- **Do NOT treat IndexedDB as guaranteed-durable** for must-keep data.

## 10. Reference implementation note

The POC implemented the private tier as a client-only dashboard route: a mock
identity switcher, a server resolver mapping user → groups → items, private
endpoints carrying no dependency keys and `no-store`, a per-user session kept out
of initial state and restored after mount, and a real IndexedDB cache that
renders offline (from cache) and clears on sign-out. The platform split (web =
Cloudflare/online-only/no-SW; mobile = Capacitor; desktop = a downloadable
Electron/Tauri build) is the agreed target architecture, chosen specifically to
avoid a service-worker ↔ native-WebView conflict and to keep the web tier always
fresh. All of it is framework-neutral; the hard constraints are the **two-tier
separation**, the **post-mount layering rule**, and **offline-only-on-native**.
