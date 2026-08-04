# To be discussed

## Localized 404 error-page variants

The prerendered 404 (`dist-web/404.html`, served by the worker as a custom error page
on unmatched paths) is currently emitted only in the default language. Per-language
variants (`/<code>/404` → `dist-web/<code>/404.html`, mirroring how `/explore` and
`/watch` are localized) are deferred.

Before emitting them, discuss the worker-side impact: the worker would need per-request
locale-pick logic to choose the right `/<code>/404.html` (from the `Accept-Language`
header or a cookie), adding CPU cycles to every 404 response. Decide whether translated
"page not found" text is worth that cost, or whether the single default-language
`404.html` is sufficient.

---

## To be discussed — pure-CSS logo variant swap (TopBar.vue)

Currently `TopBar.vue` decides small vs big logo in JS: it loads the big logo into an
`Image()`, computes its width at `h-8` (`(154 * 32) / 34 = 145px`), and a `ResizeObserver`
flips a ref when that exceeds `logoContainer.clientWidth`. Because all of this runs after
mount, the prerendered/first-paint HTML always shows the big logo and then swaps to small
on hydration → **flicker**.

The proposed fix moves the small/big decision into pure CSS (container queries + `aspect-ratio`),
which is resolved at layout time and present in the prerendered output, so first paint is
already correct and there is no hydration swap.

Open points to confirm with the project lead before implementing:

## 1. Bump browserlist to `firefox >= 110`?

`@container` / `container-type: inline-size` support:

| Browser | First version |
| --- | --- |
| Chrome / Edge | 105 (Aug 2022) |
| Safari / iOS Safari | 16.0 (Sep 2022) |
| Opera | 90 (May 2023) |
| Firefox | 110 (Feb 2023) |

Our `postcss.config.js` browserlist is `firefox >= 109`. Firefox 109 lacks container
queries; 110+ has them. Every other constraint in the list is already satisfied.

Options:
- **Bump to `firefox >= 110`** (recommended). FF109 shipped Jan 2023; negligible share today.
- Leave as-is and accept graceful degradation: FF109 shows the big logo always — identical
  to today's pre-hydration state, so no regression, just no auto-shrink. `doiuse` will still
  warn about `@container`.

`aspect-ratio` (used for sizing each logo) is fine everywhere in the list (Chrome 88, FF 89,
Safari 15).

## 2. Hardcoding the logo aspect ratio / threshold

The pure-CSS version bakes in `aspect-ratio: 154/34` (big logo) and a `145px` container-query
threshold. The current JS is shape-agnostic because it measures the loaded image.

`VITE_LOGO` / `VITE_LOGO_SMALL` are overrideable at deploy time
(`.github/workflows/app-deploy-staging.yml` writes them from GitHub vars). A custom deploy
with a differently-shaped logo would get a slightly-off threshold.

Options:
- Hardcode `154/34` + `145px` and document that custom logos must preserve the default
  aspect ratio (custom deploys already supply matching `VITE_LOGO_SMALL` pairs).
- Drive the aspect/threshold from an env-backed CSS custom property (e.g. `--logo-aspect`)
  so custom logos stay flexible — costs a little wiring in `vite.config.web.ts` / env.
- Keep a minimal JS fallback (defeats the no-flicker goal; not recommended).

## 3. Removing the JS measurement entirely

The change deletes: `logoWidth`, `isSmallScreen`, the `logo`/`logoDark`/`logoCss` computeds,
the `Image()` preload, and the whole `ResizeObserver` + `onBeforeUnmount` disconnect. Confirm
nothing else depends on those (e.g. tests referencing `isSmallScreen`, or other consumers of
the measured width). Initial grep shows no external consumers, but worth a explicit check.

## 4. Scoped style vs. Tailwind container-queries plugin

The swap can be written either as a small `<style scoped>` block with a raw `@container`
rule, or via `@tailwindcss/container-queries` utilities (`@container` / `@md:` variants).
Confirm the preferred approach for this codebase. Scoped style is zero-dependency; the plugin
is more consistent if container queries are expected to spread elsewhere.