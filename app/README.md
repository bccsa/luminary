# Luminary App

This is the frontend of the Luminary app. It's an offline-first Vue app that runs in the browser

## Project Structure

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
├── src/
│   ├── analytics/                # Analytics tracking and integration
│   ├── assets/                   # Images, styles, and static resources
│   ├── components/               # Vue components
│   ├── composables/              # Vue composables (reusable composition logic)
│   ├── guards/                   # Route guards
│   ├── pages/                    # Page-level components
│   ├── plugins/                  # Plugin system for extending functionality
│   ├── router/                   # Vue Router configuration
│   ├── stores/                   # Pinia state management stores
│   ├── tests/                    # Test utilities and helpers
│   ├── types/                    # TypeScript type definitions
│   ├── util/                     # Utility functions
│   ├── analytics.ts              # Analytics entry point
│   ├── auth.ts                   # Authentication logic
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

UI strings are stored in CouchDB language documents and loaded at runtime via `src/i18n.ts` using [vue-i18n](https://vue-i18n.intlify.dev/). The default English strings are seeded from `api/src/db/seedingDocs/lang-eng.json`.

See [docs/translations.md](../docs/translations.md) for details on:
- How to add or update translation strings
- Strings that contain named interpolation placeholders (`{variable}`)
- Strings that are shown only under specific UI conditions
- Strings reserved for future use

## Local setup

Refer to the [setup guide](../docs/setup-vue-app.md).

When running `npm run dev` the local reloading server of the app will start at http://localhost:4174.

## Query string parameters

The following query string parameters are supported:

- autoplay=true - Auto plays video when opening a post / tag with video content
- autofullscreen=true - Automatically switches to full screen video player mode on play

_Note: When navigating directly to a video post / tag URL, autoplay and autofullscreen will only work if playing without user interaction is enabled in the browser settings._

## Plugins

Plugins can be used to extend the functionality of Luminary.

### How to add plugins

- To add a plugin you need to create a plugins folder, somewhere out of the project structure
- Set the VITE_PLUGIN_PATH env variable in your .env, then vite will go fetch your files at that location and copy it into the [plugins folder](./src/plugins/)

```
VITE_PLUGIN_PATH="../../plugins"
```

- To let luminary run the plugin you need to add a env variable VITE_PLUGINS to your env file and add an array of the plugins you want to add

```
VITE_PLUGINS=["examplePlugin", "examplePlugin2"]
```

- Every plugin class should have a constructor function

**The files is being copied every time before vite build, dev, and test is run**

### Plugin format

```ts
export class examplePlugin {
    constructor() {
        this.someFunction();
    }

    someFunction() {
        return "res";
    }
}
```

**Important that the filename and the class name is the same, and that the file is a ts file**

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

## Build for production

The web version of the app can be deployed as a Docker container by building the `Dockerfile`:

```sh
docker build -t luminary-app .
docker run --rm -it -p 8080:80 luminary-app
```

`gzip` functionality is enabled by default, disable it as shown:
**It is available as a docker .env parameter**

```sh
docker run -e ENABLE_GZIP=false --rm -it -p 8080:80 luminary-app
```

This will run the app on port 8080 on the host machine.
