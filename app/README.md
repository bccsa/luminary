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
