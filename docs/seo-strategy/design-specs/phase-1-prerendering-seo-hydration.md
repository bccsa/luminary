# Phase 1 — SEO-Safe Prerendering & Clean Hydration

**Status:** Validated in POC ✓
**Delivers:** A client-rendered SPA whose dynamic, API-driven content is emitted
as **fully crawlable static HTML** (complete content + SEO metadata, visible with
JavaScript disabled) that then **hydrates cleanly** into the normal interactive
SPA — no duplicate fetch, no hydration mismatch.

---

## 1. Objective

Take a heavily client-rendered app whose content comes from an API at runtime,
and make every public, content-bearing page **exist as a static HTML document**
that:

1. contains the **full content and all SEO metadata** in the raw markup,
2. is generated **at build time** by running the real app once per route,
3. **hydrates** into the live SPA on the client with **zero mismatch** and
   **without re-fetching** the data it was built with.

## 2. Problem this solves

A pure SPA ships an empty shell and fetches content with JavaScript. This is
fragile for discovery:

- **Search crawlers** either don't run JS, or run it on a delayed, budgeted
  second pass.
- **Social / link-unfurl scrapers** (Facebook, LinkedIn, X/Twitter, WhatsApp,
  Slack, iMessage) **never** run JS — a shared link unfurls as an empty shell
  with no title, description, or image.

Prerendering removes the JavaScript dependency for the *first paint and the
metadata*, so the content and tags are present for every crawler, while the page
still becomes a full SPA for users.

## 3. Core concepts & required patterns

### 3.1 Build-time route enumeration from the data source

At build time, query the **same API/data source** the app uses to produce the
list of dynamic routes to render (e.g. one route per content item), plus the
static routes. The set of generated pages is **derived from data**, not
hand-maintained. The build must **fail fast** if the data source is unreachable
(a partial build that silently drops pages is worse than no build).

### 3.2 One data-fetch path for both environments

There must be a **single fetch abstraction** used **identically** during the
build (server/Node) and in the browser (runtime). One code path → the markup the
build produces is the markup the client would produce. No separate "SSR fetch"
vs "client fetch" logic that can drift.

### 3.3 Populate state before render (server prefetch)

Each page declares the data it needs via a **server-prefetch hook** that the
prerenderer **awaits before rendering HTML and metadata**. The data store is
fully populated *before* the markup (and head tags) are generated, so the output
reflects real data, not a loading state.

### 3.4 Server → client state transfer (the heart of clean hydration)

1. After prerender, **serialize the populated state snapshot into the HTML**
   (an inlined initial-state blob).
2. On the client, **restore that snapshot into the store *before* the app
   mounts.**
3. Therefore the client's **first render is byte-identical to the server's** →
   clean hydration, and **no second fetch** is issued for data already present.

The store's "load" actions must be **no-ops when the data is already present** —
this is what prevents the duplicate client fetch and the resulting flicker/
mismatch.

### 3.5 The clean-hydration rule (used in every phase)

> Anything **not known at build time** — per-user data, auth/session state,
> offline/local cache, device state — must be **kept out of the serialized
> snapshot** and applied **after mount** as a normal reactive update. Never swap
> data in *during* hydration.

Phase 1 only needs this for public data (which *is* in the snapshot). Phases 2–3
rely on the second half of the rule heavily. State it now; enforce it always.

This holds even when per-user content is mixed **into** an otherwise-public
prerendered page (e.g. private tiles in a public feed or a related-content
component): keep the private items out of the first paint (empty until a
post-mount fetch), give every list item a stable, unique key, and the merge is a
normal post-hydration update — no mismatch. See Phase 3 §3.1–3.2 for the full
pattern.

### 3.6 Complete SEO metadata, per page, in the static HTML

Each prerendered page must emit, **driven by the fetched data** so it is correct
in the raw HTML:

- `<title>` and `<meta name="description">` (unique per page)
- `<link rel="canonical">` (absolute, self-referential)
- `<html lang>` set to the content's language
- Open Graph: `og:type`, `og:title`, `og:description`, `og:image`
  (social-correct dimensions, e.g. 1200×630), `og:url`, and article metadata
  (`published_time`, `author`) where applicable
- Twitter/X card: `summary_large_image` + title/description/image
- **`hreflang` alternates** for multi-language content (including `x-default`),
  reciprocal across translations
- **JSON-LD structured data** (e.g. `Article`) generated from the same data that
  renders the page, so it never drifts
- `robots` directive appropriate to the page

### 3.7 Faithful, crawlable body content

The rendered body must contain the **real content** (headings with a single
`<h1>`, images with `alt` + intrinsic `width`/`height` to avoid layout shift,
body text, and **real `<a href>` internal links** so crawlers can follow them) —
not a skeleton. Verifiable by viewing source with JS disabled.

## 4. What to build (by responsibility, not file)

- A **prerender build step** that enumerates routes from data and renders each
  with the real app/components.
- A **shared fetch helper** used by both build and runtime.
- A **per-page prefetch declaration** the prerenderer awaits.
- **State serialization + restore-before-mount** wiring.
- A **reactive head/metadata layer** that derives all tags from fetched data.

## 5. Acceptance criteria (how to prove it)

1. **One static file per public route** exists after build (plus static pages
   and a real 404 document). Unpublished/draft content appears in **no** list,
   feed, or generated page.
2. **Full content + all SEO tags are in the raw HTML** (verify with `curl`/
   view-source, JS disabled): title, description, canonical, OG, Twitter,
   hreflang, JSON-LD, and the body text/heading/image.
3. **Clean hydration:** loading a page in a real browser produces **no hydration
   mismatch warnings** and **no duplicate data fetch**, and the page is
   interactive. (Make mismatch warnings visible even in the production build
   during validation, so "no warnings" is a real proof rather than a stripped
   build artifact.)
4. **JS-disabled = the crawler's view:** with JavaScript off, public pages still
   show full content and metadata. (This is also the correct test that private/
   client-only routes show *nothing* private — see Phase 3.)

## 6. Key decisions & rationale

- **Prerender (build-time) rather than per-request SSR.** The content set is
  enumerable at build time and changes are handled by regeneration (Phase 2).
  Avoids running a live render server.
- **Snapshot-and-restore over re-fetch on the client.** Eliminates the mismatch
  class of bugs and a redundant network round-trip.
- **One fetch path.** Prevents server/client divergence at the source.

## 7. Pitfalls / gotchas learned

- **Serving the wrong fallback for non-prerendered routes** causes a visible
  flash of the wrong page on direct load. (Addressed in Phase 3 with a
  content-less shell.) Be deliberate about what the host serves for routes that
  have no static file.
- **Any per-user state that leaks into the snapshot** breaks hydration and can
  leak one user's data into a shared static file. Guard the snapshot's contents.
- **Hydration warnings are stripped from production builds by default** — turn
  them back on during validation or you can't actually prove cleanliness.
- **Client-side navigation between two *dynamic* routes that resolve to the same
  component does NOT re-run mount-time hooks.** The router reuses the component
  instance and only changes the route param, so a fetch wired only to "on mount"
  never fires for the new target — the page hangs on its loading state forever.
  **Always re-trigger data loading on route-param change** (watch the param /
  on-route-update), not just on mount. (Note: a *brief* loading state when
  navigating in-app to never-visited content is normal and expected —
  prerendering bakes each page's data only into *its own* HTML; it does not
  preload other pages. The bug is getting *stuck*, not the momentary spinner.)

## 8. Production hardening (we DO want this — just not in the POC)

These were identified as real gaps to close for production. They are
**desired**, simply not built in the POC:

- **`sitemap.xml`** generated from the same enumerated route list.
- **`robots.txt`**.
- **Real production origin** for all absolute URLs (canonical/OG/hreflang) —
  configurable per environment.
- **Real, optimized images** (the POC used placeholder images) with descriptive
  filenames; consider responsive `srcset`, modern formats, `fetchpriority` on
  the hero, and lazy-loading below the fold.
- **Accurate `dateModified`** — wire it to the actual regeneration time from
  Phase 2 instead of a static value.
- Optional richer structured data (e.g. `BreadcrumbList`).

## 9. Non-goals — do NOT build these

- **Do NOT rely on client-side rendering for SEO content.** If content or
  metadata only appears after JS runs, this phase has failed.
- **Do NOT put any per-user, session, auth, or private state into the
  prerendered HTML or the serialized snapshot.** (Hard rule; see Phase 3.)
- **Do NOT introduce a separate SSR fetch path** that differs from the runtime
  one.
- **Do NOT prerender private or authenticated routes** (covered in Phase 3).

## 10. Reference implementation note

The POC used Vue 3 + a build-time prerender tool (vite-ssg) + a store (Pinia)
wired into the prerenderer's initial-state mechanism + a head-tag library
(@unhead/vue), against a small mock API. The patterns above are framework-neutral
— any SPA framework with a prerender/SSG capability, a store, and a head manager
can satisfy them.
