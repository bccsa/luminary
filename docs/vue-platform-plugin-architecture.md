# Vue Platform Plugin Architecture

> **TL;DR** — Each runtime environment (Web, Capacitor) is a Vue plugin. It registers services via `app.provide()`. Components inject those services via composables. No component ever checks the platform directly.

For the full developer guide and code examples, see [`app/src/platform/README.md`](../app/src/platform/README.md).

---

## Why

Luminary runs on two platforms: a progressive web app in the browser, and a native shell via Capacitor on iOS/Android. Some features — background audio, offline downloads, native video playback — are simply not available in the browser, or work completely differently.

Without a dedicated abstraction, platform checks (`if (isNative)`) spread across components, making the codebase harder to read and maintain. This architecture centralises platform differences into plugins, so the rest of the app is always platform-agnostic.

---

## Core concept

The system uses Vue's built-in dependency injection (`provide` / `inject`):

1. A **service API** (TypeScript type + `InjectionKey`) is defined once. This is the shared interface.
2. A **platform plugin** provides an implementation for that interface at startup.
3. **Components** inject the implementation through a composable. They never import platform-specific files.

```
┌──────────────────────────────────────────────────────────────┐
│ main.ts                                                       │
│   isCapacitorPlatform()                                       │
│     → app.use(CapacitorPlatformPlugin)  // native            │
│     → app.use(WebPlatformPlugin)        // web               │
└───────────────────────────┬──────────────────────────────────┘
                            │  app.provide(MediaPlayerKey, impl)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Any component                                                 │
│   const { VideoPlayer, capabilities } = useMediaPlayer()     │
│   <component :is="VideoPlayer" ... />                        │
└──────────────────────────────────────────────────────────────┘
```

Dynamic `import()` at startup ensures the native bundle is never sent to web users and vice versa.

---

## Structure

```
platform/
  detect.ts          Runtime platform detection (isCapacitorPlatform)
  types/
    index.ts         Barrel export — one line per service
    mediaPlayer.ts   MediaPlayerService type + MediaPlayerKey
  web/
    index.ts         WebPlatformPlugin (install → app.provide)
    WebVideoPlayer.vue
  capacitor/
    index.ts         CapacitorPlatformPlugin (install → app.provide)
    CapacitorVideoPlayer.vue

composables/
  useMediaPlayer.ts  Inject wrapper for MediaPlayerService
```

---

## Key files and their roles

### `platform/types/<service>.ts` — Service API

Defines what the service looks like from the consumer's point of view. Never contains implementation logic.

```ts
// platform/types/mediaPlayer.ts
export type MediaPlayerService = {
    VideoPlayer: Component;
    capabilities: PlatformCapabilities;
};

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("media-player");
```

`PlatformCapabilities` contains boolean flags that describe what the current platform's implementation supports. Components use these flags to show or hide UI — they never check the platform name.

```ts
export type PlatformCapabilities = {
    playback: {
        nativePlayback: boolean;
        nativeFullscreen: boolean;
        pictureInPicture: boolean;
        backgroundAudio: boolean;
        seekControl: boolean;
        playbackRateControl: boolean;
    };
    tracks: {
        audioTrackSelection: boolean;
    };
    offline: {
        downloads: boolean;
        progressTracking: boolean;
        deleteDownloadedMedia: boolean;
    };
};
```

### `platform/web/index.ts` and `platform/capacitor/index.ts` — Platform plugins

Each is a standard Vue plugin. Its `install` method calls `app.provide()` to register service implementations for its runtime.

```ts
export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: WebVideoPlayer,
            capabilities: {
                playback: { nativePlayback: false, backgroundAudio: false, ... },
                offline: { downloads: false, ... },
                ...
            },
        });
    },
};
```

The Capacitor plugin does the same but with a native player component and capability flags set to `true` where the native shell provides the feature.

### `composables/useMediaPlayer.ts` — Consumer entry point

This is the only import app components need.

```ts
export function useMediaPlayer(): MediaPlayerService {
    const service = inject(MediaPlayerKey);
    if (!service) {
        throw new Error(
            "useMediaPlayer() was called before a platform plugin was installed. " +
            "Ensure app.use(WebPlatformPlugin) or app.use(CapacitorPlatformPlugin) " +
            "is called in main.ts before app.mount().",
        );
    }
    return service;
}
```

### `main.ts` — Startup registration

```ts
import { isCapacitorPlatform } from "./platform/detect";

if (isCapacitorPlatform()) {
    const { CapacitorPlatformPlugin } = await import("./platform/capacitor");
    app.use(CapacitorPlatformPlugin);
} else {
    const { WebPlatformPlugin } = await import("./platform/web");
    app.use(WebPlatformPlugin);
}

// VITE_PLUGINS load after — they can optionally override platform services
await loadPlugins(app);
```

---

## Consuming a service in a component

```vue
<script setup lang="ts">
import { useMediaPlayer } from "@/composables/useMediaPlayer";

const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
    <!-- Renders the correct player for the current platform -->
    <component :is="VideoPlayer" :content="content" :audioTrackLanguage="lang" />

    <!-- Only shown when the platform supports offline downloads -->
    <DownloadButton v-if="capabilities.offline.downloads" :content="content" />
</template>
```

No `isNative` check. No direct platform import. The component works identically on web and Capacitor.

---

## Adding a new service

Adding a service follows the same pattern every time:

1. **Define the API** — add `myService.ts` in `platform/types/` with the type and `InjectionKey`.
2. **Re-export it** — add `export * from "./myService"` to `platform/types/index.ts`.
3. **Provide implementations** — add `app.provide(MyServiceKey, impl)` in both `platform/web/index.ts` and `platform/capacitor/index.ts`.
4. **Create a composable** — `composables/useMyService.ts` wraps `inject(MyServiceKey)`.
5. **Use it** — call `useMyService()` in components.

`main.ts` and `detect.ts` do not need to change.

---

## Relationship to `VITE_PLUGINS`

`VITE_PLUGINS` is a separate mechanism for organisation-specific plugins that are bundled at build time. It is not the same as the platform plugin system.

| | Platform plugins | `VITE_PLUGINS` |
|---|---|---|
| Purpose | Web vs. native runtime differences | Organisation-level customisation |
| Count | Exactly one active at startup | 0..n, all active |
| Added by | Core team | Deploying organisation |

Platform plugins install first so that `VITE_PLUGINS` can optionally override any service by providing a different implementation for the same key.

---

## Design decisions

**Why `provide`/`inject` and not a module-level singleton?**
`provide`/`inject` integrates naturally with Vue's component tree and test utilities. A singleton would need its own reset mechanism for tests.

**Why dynamic `import()`?**
It keeps the Capacitor-specific code out of the web bundle entirely. Tree-shaking at the module level is more reliable than conditional code that might still be included.

**Why capability flags instead of platform name checks?**
Platform names are implementation details. Flags like `capabilities.offline.downloads` describe what the current implementation can actually do. If a future web build gains download support, no component code needs to change — only the plugin's flags.

**Why a composable wrapper instead of calling `inject()` directly?**
The composable throws a descriptive error if the service is missing (useful in tests and local development) and gives consumers a single import to update if the service name or key ever changes.
