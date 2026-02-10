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

## Security: npm overrides

This package uses **npm overrides** to manage security vulnerabilities in transitive dependencies. The `overrides` field in `package.json` forces specific versions of packages throughout the dependency tree.

### Current overrides:

- **lodash** → `^4.17.23` - Fixes prototype pollution vulnerability ([GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg))
- **glob** → `^11.1.0` - Fixes command injection vulnerability ([GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2))
- **js-yaml** → `^4.1.1` - Fixes prototype pollution vulnerability ([GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m))
- **esbuild** → `^0.25.0` - Fixes CORS vulnerability ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99))
- **min-document** → `^2.19.2` - Fixes prototype pollution vulnerability ([GHSA-rx8g-88g5-qh64](https://github.com/advisories/GHSA-rx8g-88g5-qh64))

### Why overrides?

Many vulnerabilities exist in **transitive dependencies** (dependencies of our dependencies). Using overrides allows us to fix these immediately without waiting for parent packages to update.

### Maintenance

When adding or updating overrides:
1. Identify the vulnerability and required version
2. Update the `overrides` section in `package.json`
3. Run `npm install` to apply changes
4. Test thoroughly: `npm run build && npm run test`
5. Update this README with the vulnerability information

For more details, see:
- [SECURITY.md](../SECURITY.md) - Complete security policy
- [ADR 0008](../docs/adr/0008-npm-overrides-for-security.md) - Decision rationale
