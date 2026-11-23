# Luminary App

This is the frontend of the Luminary app. It's an offline-first Vue app that runs in the browser.

## Architecture (build-time plugins)

Cross-cutting services follow a **contract + injection key + build-time virtual module** pattern: Vite resolves each `virtual:…` id to an entry under **`src/build-time/plugins/<name>/`**, and **`src/build-time/contracts/plugin-registry.ts`** registers those services on the app. Feature code uses **`inject`** with keys from **`token.ts`** under **`src/build-time/contracts/`**, not direct imports of adapter code.

**Example in this repo:** the **demo banner** (`virtual:demo-banner`, `src/build-time/plugins/demo-banner/`). Full pattern and diagrams: **[docs/vue-plugin-architecture/README.md](docs/vue-plugin-architecture/README.md)**. Step-by-step for a **second** plugin: **[Adding another build-swapped plugin](docs/vue-plugin-architecture/README.md#adding-another-plugin)**.

## Project structure

> **Note:** We are currently migrating to a new component organization structure where each feature folder will contain a `__tests__` subdirectory alongside its related components. For example:
>
> ```
> pages/ComponentFolder/
> ├── __tests__/
> └── [related components]
> ```

```
app/
├── e2e/                          # End-to-end tests
│   ├── tsconfig.json
│   └── vue.spec.ts
├── public/                       # Static assets
├── scripts/                      # Build and deployment scripts
│   └── setup-nginxvars.sh
├── vite-plugins/                 # Vite-only helpers (e.g. build-time module resolution)
├── src/
│   ├── build-time/               # Build-swapped services (contracts + implementations)
│   │   ├── contracts/            # plugin-registry.ts, <name>/contract.ts, token.ts
│   │   └── plugins/              # e.g. demo-banner/: index.ts, *-web.ts, plugin UI bits
│   ├── analytics/                # Analytics tracking and integration
│   ├── assets/                   # Images, styles, and static resources
│   ├── components/               # Vue components
│   ├── composables/              # Vue composables (reusable composition logic)
│   ├── guards/                   # Route guards
│   ├── pages/                    # Page-level components
│   ├── router/                   # Vue Router configuration
│   ├── stores/                   # Pinia state management stores
│   ├── tests/                    # Test utilities and helpers
│   ├── types/                    # TypeScript type definitions
│   ├── util/                     # Utility functions
│   ├── analytics.ts              # Analytics entry point
│   ├── globalConfig.ts           # Global configuration
│   ├── i18n.ts                   # Internationalization setup
│   ├── main.ts                   # Application entry point
│   └── App.vue                   # Root Vue component
├── Dockerfile                    # Docker configuration for production
├── nginx.conf                    # Nginx configuration for production
├── index.html                    # HTML entry point
├── package.json                  # Dependencies and scripts
├── playwright.config.ts          # Playwright E2E test configuration
├── postcss.config.js             # PostCSS configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration (base)
├── tsconfig.app.json             # TypeScript configuration (app)
├── tsconfig.node.json            # TypeScript configuration (Node)
├── tsconfig.vitest.json          # TypeScript configuration (Vitest)
├── vite.config.ts                # Vite build configuration
├── vitest.config.ts              # Vitest test configuration
└── vitest.setup.ts               # Vitest test setup
```

## Internationalisation

UI strings are stored in CouchDB language documents and loaded at runtime via `src/i18n.ts` using [vue-i18n](https://vue-i18n.intlify.dev/). The default English strings are seeded from `api/src/db/seedingDocs/content/lang-eng.json`.

See [docs/guides/translations.md](../docs/guides/translations.md) for details on:

- How to add or update translation strings
- Strings that contain named interpolation placeholders (`{variable}`)
- Strings that are shown only under specific UI conditions
- Strings reserved for future use

## Reading progress

The app tracks how far a user has read through article text and surfaces in-progress posts on the homepage **Continue Reading** row. Segment-based gates (visibility, skim detection, dwell time) ensure progress reflects actual reading, including long paragraphs on small screens.

Full design, diagrams, and constants: **[docs/reading-progress-tracker/README.md](docs/reading-progress-tracker/README.md)**.

## User activity and account sync

Likes, highlighted passages and viewing history live in `luminary-user-db`, with their
own outbound queue and sync cursor. Recording works offline and while signed out.
Uploads and pulls require a signed-in user, accepted privacy policy status and an API
advertising `user-v2` in `clientConfig.dataSources`. Until the API supports that source,
activity stays local and queued; no user-data requests are sent.

At sign-in, unowned device history is adopted by the account. An existing owner marker
is retained after session loss, so the same user can resume uploading later. Signing in
as a different user clears the previous owner's device data before transport starts.
The marker is stored inside the source database and is removed when that database clears.

Logout is refused offline from every entry point. Online, it attempts to flush for up
to three seconds and asks for confirmation if anything remains unsent. Proceeding clears
activity from the device before clearing credentials. Account activity returns on a later
sign-in and pull. Clear activity while signed in writes tombstones for all held rows and
applies across devices as they sync; while signed out, it wipes the local copy. Activity
still unsent on another offline device can appear when that device connects.

Pulls run after connection/sign-in, after uploads drain and when the page becomes visible.
Incoming changes refresh activity lists, recommendations and highlights in mounted articles.
Activity is ordered by `activityTimeUtc`; the server's `updatedTimeUtc` is only a sync cursor.

Reading/video resume positions and preferences remain device-local. Only the fact and time
of viewing are mirrored into activity, at most once a minute while progress changes. Existing
reading progress is backfilled once per device, so logout or clearing history cannot recreate
old viewing activity on the next startup. Both the SPA and hydrated web build initialize these
migrations and the progress mirror before components mount.

## Local activity migration

The current activity format uses deterministic UUID ids and `type` values `viewed`,
`liked` or `highlighted`. Highlights store a root `range`; deleting one retains its offsets
and removes its quotation. Stored activity and pending uploads from the earlier envelope
are converted in a single transaction before sync starts, preserving the account marker.
The new format uses independent cursors for each type under `syncList:v2`.

Highlights use one activity row per passage. The passage migration has its own
completion marker (`userActivityPassagesMigrated`), so devices that already ran the
older activity migration still upgrade. Existing passage rows, including tombstones,
take precedence over legacy data.

Legacy highlights whose content is missing locally are looked up remotely in bounded
requests. Offline use and failed HTTP requests retain unresolved entries and retry on
the next startup. A successful lookup retires entries that still cannot be resolved.
The legacy `luminaryInternals["highlights"]` key is deleted after migration completes.

## Local setup

Refer to the [setup guide](../docs/guides/setup-vue-app.md).

When running `npm run dev` the local reloading server of the app will start at http://localhost:4174.

## Query string parameters

The following query string parameters are supported:

- autoplay=true — Auto plays video when opening a post / tag with video content
- autofullscreen=true — Automatically switches to full screen video player mode on play
- affinityDebug — Shows a floating debug overlay with the local recommendation affinity profile (dev/QA tool, works on any environment). Stays on across navigation and reloads for the rest of the browser-tab session; switch it off with `affinityDebug=false`.

_Note: When navigating directly to a video post / tag URL, autoplay and autofullscreen will only work if playing without user interaction is enabled in the browser settings._

## Render state event

The app exposes a render lifecycle signal that external tooling (e.g. static site generation, pre-rendering, or integration tests) can hook into to know when the DOM is fully populated.

- A `data-render-state` attribute is set on `<html>` and updated as the state changes.
- A `render-state-change` `CustomEvent` is dispatched on `window` whenever the state changes. The new state is available on `event.detail`.

States:

- `loading` — the app is bootstrapping or the current page is still populating
- `ready` — the app has booted and the current page has finished populating the DOM
- `error` — the app failed to boot or the current page errored

Example consumer (e.g. a pre-render runner):

```js
if (document.documentElement.dataset.renderState === "ready") {
    // already done
} else {
    window.addEventListener("render-state-change", (e) => {
        if (e.detail === "ready") {
            // snapshot the DOM
        }
    });
}
```

Note: SSG / ISR is not part of the Luminary main project — this event is provided so implementers can build their own pre-rendering pipeline on top of it.

## Content freshness & the session clock

Content visibility queries filter on `publishDate` and `expiryDate` relative to "now" (see [`src/util/mangoIsPublished.ts`](src/util/mangoIsPublished.ts)). That "now" is **not** a live `Date.now()` — it is captured **once on page load** and held constant for the lifetime of the page via [`src/util/sessionNow.ts`](src/util/sessionNow.ts).

Why it's frozen: the publish/expiry bounds are embedded directly in the Mango query selector, and `HybridQuery` (in `luminary-shared`) uses the serialized selector as its reactive dedup key. A live clock changes the selector on every tick, so any reactive re-evaluation of a query during load would produce a new key, defeating the dedup and re-firing the API-supplement `POST`. Freezing "now" makes those selectors byte-stable, so a query only rebuilds when something _semantic_ changes. This mirrors `contentPublishDateCutoff`, which is likewise captured once at startup in [`src/main.ts`](src/main.ts).

**Trade-off (intentional):** in a long-lived session the bound does not advance, so content that crosses its publish or expiry boundary _after_ load only reflects on the next page load. For example, a "coming soon" tile whose `publishDate` passes while the tab stays open keeps rendering as coming-soon until reload. This is acceptable for authored content and PWAs reload often. If a long session ever needs to pick up scheduled transitions live, promote `sessionNow` to a `ref` ticked on a coarse interval (e.g. every few minutes) — every query referencing it then rebuilds _together_, once per tick, which still avoids the per-ref-change storm.

> Note: the "coming soon" badge styling on a content tile ([`src/components/content/ContentTile.vue`](src/components/content/ContentTile.vue)) is a render-time check using a live `Date.now()`, not a query, so it is unaffected by the frozen session clock.

## PWA install state & content sync tiering

How much content is pre-synced into IndexedDB depends on whether the app is running as an **installed PWA** (launched from the home-screen icon, in `display-mode: standalone`) or in a normal **browser tab**. The tier is decided **once per launch** in [`src/main.ts`](src/main.ts) from [`isInstalledStandalone()`](src/globalConfig.ts) (which checks the `standalone`/`minimal-ui`/`fullscreen` display modes and iOS `navigator.standalone`):

- **Installed (standalone):** no `publishDate` cutoff — the full corpus syncs for offline use.
- **Browser tab:** only the last ~1 month (`BROWSER_CONTENT_SYNC_WINDOW_MS`) is pre-synced; older content is fetched on demand by `HybridQuery` (see [`shared/src/util/HybridQuery/README.md`](../shared/src/util/HybridQuery/README.md)).

Because the tier is captured at startup (like the frozen session clock above), installing the app takes effect on the **next** launch.

### Language tiering (synced languages + fallback, all via sync)

**Language caps.** A user may pick at most **3 preferred** languages ([`appLanguageIdsAsRef`](src/globalConfig.ts)); the CMS default (English) is auto-appended for display only (in [`appDisplayLanguageIdsAsRef`](src/globalConfig.ts)) and is not counted against the cap. The **synced** set ([`appSyncedLanguageIdsAsRef`](src/globalConfig.ts)) — the "Available offline" toggle — must be a subset of the preferred set and is likewise capped at **3** (the primary is always synced). These caps are enforced client-side in [`globalConfig.ts`](src/globalConfig.ts) (`normalizePreferredLanguages` / `normalizeSyncedLanguages`) and the [`LanguageModal`](src/components/navigation/LanguageModal.vue), and **authoritatively by the API** (`QUERY_MAX_LANGUAGES`, default 4 = 3 + the default; non-CMS only).

Sync downloads content for the user's **synced** languages **plus the last-resort fallback**: a post whose only published translation is in a non-synced language is downloaded via sync's set-based language keep, so it is present offline and picked by the display-side priority ([`appDisplayLanguageIdsAsRef`](src/globalConfig.ts)) with **no per-feed API query**. (A preferred-but-**unsynced** language is intentionally not downloaded — you see the best synced/fallback translation.) See [`shared/src/api/sync/README.md`](../shared/src/api/sync/README.md).

Content browsing therefore depends on sync having populated IndexedDB — there is no full API-only content fetch; a fresh install shows content once initial sync fills the window.

### Matomo analytics

`initAnalytics()` ([`src/analytics.ts`](src/analytics.ts)) tags each Matomo session with its display mode (`installed` vs `browser`) so install adoption and its effect on the sync window can be measured.

To enable **per-pageview segmentation** in Matomo, create the custom dimension in Matomo admin and set `VITE_ANALYTICS_PWA_DIMENSION_ID` in the app's env. Until then the fallback `["trackEvent", "PWA", "displayMode", …]` event fires automatically — so the signal is captured either way, no config required to ship.

## Build for production

The web version of the app can be deployed as a Docker container by building the `Dockerfile`:

```sh
docker build -t luminary-app .
docker run --rm -it -p 8080:80 luminary-app
```

`gzip` functionality is enabled by default; disable it as shown (available as a Docker `.env` parameter):

```sh
docker run -e ENABLE_GZIP=false --rm -it -p 8080:80 luminary-app
```

This will run the app on port 8080 on the host machine.

### Update-detection cache TTL (CDN tuneable)

The in-app update banner (web `app-update` plugin, [`app-update-web.ts`](src/build-time/plugins/app-update/app-update-web.ts)) polls `/version.json` every 5 seconds and compares it to the build ID baked into the running bundle. `nginx.conf` sends `Cache-Control: no-cache, s-maxage=60` for this file: browsers must always revalidate (TTL 0), while a shared/CDN cache may serve it from cache for up to 60 seconds (TTL 60) to absorb that polling load without meaningfully delaying update detection.

**If you deploy behind a CDN, verify it honours `s-maxage`** — some CDNs ignore it, or only cache recognised static extensions and skip a bare `/version.json` by default, or need an explicit cache/rewrite rule to apply a short TTL to this path instead. Keep the TTL small (order of a minute) so deployed clients still pick up new builds promptly.

To check whether the CDN is actually honouring the TTL, request `/version.json` through the CDN (not the origin) a few times in a row and inspect the response headers:

```sh
curl -sD - -o /dev/null https://<your-cdn-domain>/version.json
```

- Look for a cache-status header (`Age`, `X-Cache`, `CF-Cache-Status`, `X-Amz-Cf-Id`, etc. depending on vendor). `Age` should climb from `0` toward `60` and then reset; `X-Cache`/`CF-Cache-Status` should show `HIT` between origin fetches.
- If every request comes back `MISS`/`Age: 0`, or the `Cache-Control` header is missing/rewritten, the CDN isn't respecting `s-maxage` and needs an explicit path rule for `/version.json` (e.g. Cloudflare Cache Rules, a CloudFront cache behavior, or a Fastly VCL snippet) forcing an edge TTL of ~60s.
