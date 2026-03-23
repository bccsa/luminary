# Platform Plugin System

This folder implements a **platform abstraction layer** for the Luminary app.

The core idea is simple: some features behave differently depending on the runtime environment (web browser vs. Capacitor native shell). Rather than scattering `if (isNative)` branches across the codebase, this system lets each environment register its own implementations once at startup. Every component in the app then gets the right implementation automatically — without knowing which platform it is running on.

---

## The problem

Some functionality cannot be shared between web and native:

| Feature | Web / PWA | Capacitor (native) |
|---|---|---|
| Video playback | Video.js (HTML5) | Native OS player |
| Background audio | Not possible in browser | OS media session API |
| Offline downloads | Not available | Device Filesystem API |
| Push notifications | Web Push API | Native push via Capacitor |

Without an abstraction, every component that touches these features needs to know about the platform. That coupling spreads across the entire codebase and makes it hard to add a new platform later.

---

## How the system works

There are four moving parts.

### 1. A contract (`types.ts`)

Every service that can vary per platform is described as a TypeScript type, paired with a typed injection key.

```ts
// Example: a service that can be different on each platform
export type SomeService = {
    doSomething(): void;
};

export const SomeServiceKey: InjectionKey<SomeService> = Symbol("some-service");
```

The injection key is the only thing consumers ever import from this folder. They never import a concrete implementation directly.

### 2. One plugin per platform (`web/index.ts`, `capacitor/index.ts`)

Each platform is a standard Vue plugin. Its `install()` method calls `app.provide()` for every service it implements:

```ts
export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(SomeServiceKey, new WebSomeService());
        // app.provide(AnotherServiceKey, new WebAnotherService());
        // ... as many services as needed
    },
};
```

The Capacitor plugin does the same with native implementations.

### 3. Platform detection and registration (`main.ts`)

At startup, the correct plugin is installed once:

```ts
if (isCapacitorPlatform()) {
    const { CapacitorPlatformPlugin } = await import("./platform/capacitor");
    app.use(CapacitorPlatformPlugin);
} else {
    const { WebPlatformPlugin } = await import("./platform/web");
    app.use(WebPlatformPlugin);
}
```

Dynamic `import()` ensures that the Capacitor bundle is never downloaded in a web build, and vice versa.

### 4. A composable per service (`composables/`)

Each service gets a small composable that wraps `inject()`. This is the only thing application components call:

```ts
// composables/useSomeService.ts
export function useSomeService(): SomeService {
    const service = inject(SomeServiceKey);
    if (!service) throw new Error("No SomeService registered for this platform.");
    return service;
}
```

```vue
<!-- AnyComponent.vue — no platform knowledge here -->
<script setup>
const { doSomething } = useSomeService();
</script>
```

---

## Current services

### Media player (`MediaPlayerKey`)

The first service implemented with this pattern.

```
platform/
  types.ts                        ← MediaPlayerService type + MediaPlayerKey
  web/
    index.ts                      ← WebPlatformPlugin
    WebVideoPlayer.vue            ← Video.js implementation
  capacitor/
    index.ts                      ← CapacitorPlatformPlugin
    CapacitorVideoPlayer.vue      ← Native player (stub — replace when adding Capacitor)
```

**Contract:**
```ts
export type MediaPlayerService = {
    VideoPlayer: Component;         // accepts { content, audioTrackLanguage } props
    capabilities: PlatformCapabilities;
};
```

**Usage:**
```vue
<script setup>
const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
    <component :is="VideoPlayer" :content="content" :audioTrackLanguage="audioTrackLanguage" />
    <DownloadButton v-if="capabilities.offlineDownloads" :content="content" />
</template>
```

`capabilities` flags let components show or hide UI that only makes sense on certain platforms, without hard-coding platform checks.

---

## Adding a new pluggable service

Say you want to add offline download support that works natively on Capacitor and is a no-op on web.

**Step 1 — Define the contract in `types.ts`:**

```ts
export type DownloadService = {
    download(content: ContentDto): Promise<void>;
    listDownloads(): Promise<ContentDto[]>;
    deleteDownload(contentId: string): Promise<void>;
};

export const DownloadServiceKey: InjectionKey<DownloadService> = Symbol("download-service");
```

**Step 2 — Implement for each platform:**

```ts
// platform/web/WebDownloadService.ts  (no-op)
export class WebDownloadService implements DownloadService {
    download() { return Promise.resolve(); }
    listDownloads() { return Promise.resolve([]); }
    deleteDownload() { return Promise.resolve(); }
}

// platform/capacitor/CapacitorDownloadService.ts  (real)
export class CapacitorDownloadService implements DownloadService {
    async download(content) { /* Capacitor Filesystem API */ }
    // ...
}
```

**Step 3 — Register in each platform plugin:**

```ts
// platform/web/index.ts
app.provide(DownloadServiceKey, new WebDownloadService());

// platform/capacitor/index.ts
app.provide(DownloadServiceKey, new CapacitorDownloadService());
```

**Step 4 — Create the composable:**

```ts
// composables/useDownloads.ts
export function useDownloads(): DownloadService {
    const service = inject(DownloadServiceKey);
    if (!service) throw new Error("No DownloadService registered.");
    return service;
}
```

**Step 5 — Use it anywhere:**

```vue
<script setup>
const { download, listDownloads } = useDownloads();
</script>
```

No changes to `main.ts`, `detect.ts`, or any existing consumer component.

---

## Adding a new platform

If a third runtime environment is ever needed (e.g. Electron, a different mobile framework):

1. Create a new `platform/<name>/` folder with an `index.ts` plugin and implementation files.
2. Add one condition in `main.ts`.

Nothing else changes.

---

## Relationship to `VITE_PLUGINS`

The app has two separate plugin mechanisms. They serve different purposes and must not be confused.

| | Platform plugins (this folder) | `VITE_PLUGINS` (`src/plugins/`) |
|---|---|---|
| **Purpose** | Web vs. native differences | Organisation-specific customisation |
| **When active** | Always — exactly one per build | Optional — zero or more per build |
| **How loaded** | Hardcoded in `main.ts` via `isCapacitorPlatform()` | Copied into `src/plugins/` at build time via `VITE_PLUGIN_PATH` |
| **Examples** | Video player, background audio, downloads | Custom analytics, branding, feature flags |

### Startup order

In `main.ts`, the platform plugin always runs **first**, followed by external plugins:

```ts
// 1. Platform services are registered first
app.use(WebPlatformPlugin);  // or CapacitorPlatformPlugin

// 2. External plugins run after — they can inject new services or
//    override a platform service by calling app.provide() with the same key
await loadPlugins(app);
```

This means:
- External plugins can safely use platform services in their `install()` method because they are already registered.
- An external plugin that calls `app.provide(MediaPlayerKey, ...)` will **override** the default platform implementation, which is intentional — it gives deployers a hook to swap any service without forking the codebase.

### Writing an external plugin that uses the platform system

```ts
// src/plugins/acmeCustomisation.ts
import type { App } from "vue";
import type { LuminaryPlugin } from "@/util/pluginLoader";
import { MediaPlayerKey } from "@/platform/types";

export class acmeCustomisation implements LuminaryPlugin {
    install(app: App) {
        // Override the default video player with a custom one
        app.provide(MediaPlayerKey, {
            VideoPlayer: AcmeVideoPlayer,
            capabilities: { backgroundAudio: false, offlineDownloads: false, nativeFullscreen: false },
        });
    }
}
```

---

## Testing

Mock the composable at the module level. No Vue providers or test wrappers needed:

```ts
vi.mock("@/composables/useMediaPlayer", () => ({
    useMediaPlayer: () => ({
        VideoPlayer: { template: "<div />" },
        capabilities: { backgroundAudio: false, offlineDownloads: false, nativeFullscreen: false },
    }),
}));
```

Platform implementations are tested in isolation in their own spec files.

---

## Design rules

These rules keep the system clean as it grows:

1. **Components never import from `platform/` directly.** They only call composables.
2. **Every service variation goes through an `InjectionKey`.** No `if (isNative)` in components.
3. **Each platform plugin provides all services.** If a service doesn't apply, provide a no-op.
4. **The contract lives in `types.ts`.** Both the plugin and the composable import from there — nowhere else.
