# Luminary App

This is the frontend of the Luminary app. It's an offline-first Vue app that runs in the browser.

## Architecture (build-time plugins)

Cross-cutting services can follow a **contract + injection key + build-time virtual module** pattern: Vite resolves `virtual:…` to one implementation folder under `src/plugins/<name>/`, and **`src/core/plugin-registry.ts`** registers those services on the app. Feature code uses **`inject`** with keys from **`token.ts`** files, not direct imports of adapter code.

**Example in this repo:** the global **audio player** (`virtual:media-player`, `src/plugins/media-player/`). Full pattern and diagrams: **[docs/research/vue-plugin-architecture/README.md](../docs/research/vue-plugin-architecture/README.md)**. Step-by-step for a **second** plugin (same mechanism): **[Adding another build-swapped plugin](../docs/research/vue-plugin-architecture/README.md#adding-another-build-swapped-plugin)**.

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
│   ├── analytics/                # Analytics tracking and integration
│   ├── assets/                   # Images, styles, and static resources
│   ├── components/               # Vue components
│   ├── composables/              # Vue composables (reusable composition logic)
│   ├── core/                     # App composition (e.g. plugin registry)
│   ├── guards/                   # Route guards
│   ├── pages/                    # Page-level components
│   ├── plugins/                  # build-swapped plugins (e.g. media-player) + optional extension classes
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

### `BUILD_TARGET` (virtual plugins)

Defaults to **`web`**. Set in **`app/.env`** when needed (see `.env.example`):

```bash
BUILD_TARGET=web
```

Selects which subdirectory under each plugin (e.g. `plugins/media-player/{BUILD_TARGET}/`) Vite resolves for `virtual:…` modules. See [architecture doc](../docs/research/vue-plugin-architecture/README.md).

### Extension plugins (optional classes)

Separate from **`virtual:…`** plugins: you can load extra TypeScript modules from outside the repo and instantiate them at startup.

- Create a folder for those files somewhere **outside** this repo.
- Set `VITE_PLUGIN_PATH` in `.env` so Vite copies those files into `src/plugins/` before dev/build/test.
- Set `VITE_PLUGINS` to a JSON array of **file base names** (no `.ts`) to load via `src/util/pluginLoader.ts`.

```bash
VITE_PLUGIN_PATH="../../plugins"
VITE_PLUGINS='["examplePlugin","examplePlugin2"]'
```

Each module must export a **class whose name matches the file name** (e.g. `examplePlugin.ts` exports `class examplePlugin`). The files are copied every time you run `vite` dev/build or Vitest.

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

- autoplay=true — Auto plays video when opening a post / tag with video content
- autofullscreen=true — Automatically switches to full screen video player mode on play

_Note: When navigating directly to a video post / tag URL, autoplay and autofullscreen will only work if playing without user interaction is enabled in the browser settings._

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
