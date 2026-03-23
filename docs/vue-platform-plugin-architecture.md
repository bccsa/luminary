# Vue Platform Plugin Architecture

## Codebase Findings

Before designing the new system, here is what already exists and what to do with each piece.

### Existing Plugin Infrastructure

**`app/src/util/pluginLoader.ts`** — Keep, improve  
Dynamically imports files from `src/plugins/` based on `VITE_PLUGINS` env var and instantiates classes. However it has three problems: (1) it does not pass the Vue `App` instance to plugins, (2) it does not call `app.use()`, and (3) there is no explicit plugin service API/interface that loaded classes must implement. This file should be extended to support proper Vue plugins.

**`app/src/plugins/examplePlugin.ts`** — Remove  
A bare class stub with no interface, no `install()` method, and no integration with Vue. Once the new architecture is in place, this can be deleted and replaced with a real example.

**`app/src/components/content/VideoPlayer.vue`** — Keep, rename, refactor  
A fully working Video.js-based player. It should become `WebVideoPlayer.vue` — the **web implementation** of the media player interface. No logic needs to change; only the file name and registration path change.

**`app/src/components/content/AudioPlayer.vue`** — Keep as-is for now  
The audio player is separately mounted in `App.vue` with its own media queue. It does not need to be part of the platform plugin on day one. It can be migrated later.

**`app/src/globalConfig.ts` (media progress helpers)** — Keep as-is  
`getMediaProgress`, `setMediaProgress`, `removeMediaProgress` are implementation-agnostic utilities. They stay where they are and both web and Capacitor implementations call them.

---

## Architecture

### Core Idea

Each "platform" (Web, Capacitor, etc.) is a **Vue plugin** that calls `app.provide()` to register a typed implementation of a shared interface. Consumer components call `inject()` to get the right implementation — they never import a concrete player directly.

This is the standard Vue dependency injection pattern, extended to support multiple pluggable "services", not just media playback.

```
┌─────────────────────────────────────────────────────────────┐
│ main.ts                                                      │
│  detectPlatform() → app.use(WebPlatformPlugin)               │
│                  or app.use(CapacitorPlatformPlugin)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ app.provide(MediaPlayerKey, impl)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Consumer (SingleContent.vue, etc.)                           │
│  const { VideoPlayer } = useMediaPlayer()                    │
│  <component :is="VideoPlayer" :content="..." />              │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
app/src/
  platform/
    types.ts                    ← shared interfaces and injection keys
    detect.ts                   ← runtime platform detection
    web/
      index.ts                  ← WebPlatformPlugin (Vue Plugin)
      WebVideoPlayer.vue        ← current VideoPlayer.vue, renamed
    capacitor/
      index.ts                  ← CapacitorPlatformPlugin (Vue Plugin)
      CapacitorVideoPlayer.vue  ← native implementation (future)
  composables/
    useMediaPlayer.ts           ← inject wrapper, typed
  util/
    pluginLoader.ts             ← improved to pass App and call app.use()
```

---

## Implementation

### 1. Shared Types (`platform/types.ts`)

This file is the service API. It is the only thing consumer components ever import from the platform layer.

```typescript
import type { InjectionKey, Component } from "vue";
import type { ContentDto } from "luminary-shared";

/**
 * Props that every VideoPlayer implementation must accept.
 */
export type VideoPlayerProps = {
    content: ContentDto;
    language: string | null | undefined;
};

/**
 * The capabilities that a platform implementation exposes.
 * Consumer components can gate features behind these flags.
 */
export type PlatformCapabilities = {
    backgroundAudio: boolean;
    offlineDownloads: boolean;
    nativeFullscreen: boolean;
};

/**
 * The full media player service registered by a platform plugin.
 * Add more components here as the system grows (e.g. AudioPlayer, DownloadManager).
 */
export type MediaPlayerService = {
    VideoPlayer: Component;
    capabilities: PlatformCapabilities;
};

/**
 * Typed injection key. Use this to provide and inject the media player service.
 */
export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("media-player");
```

### 2. Platform Detection (`platform/detect.ts`)

```typescript
/**
 * Returns true when running inside a Capacitor native shell.
 * Safe to call before Capacitor is fully initialised.
 */
export const isCapacitorPlatform = (): boolean => {
    return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
};
```

### 3. Web Platform Plugin (`platform/web/index.ts`)

```typescript
import type { App, Plugin } from "vue";
import { MediaPlayerKey } from "../types";
import WebVideoPlayer from "./WebVideoPlayer.vue";

export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: WebVideoPlayer,
            capabilities: {
                backgroundAudio: false,
                offlineDownloads: false,
                nativeFullscreen: false,
            },
        });
    },
};
```

`WebVideoPlayer.vue` is the current `VideoPlayer.vue` moved to this folder. No logic changes.

### 4. Capacitor Platform Plugin (`platform/capacitor/index.ts`)

```typescript
import type { App, Plugin } from "vue";
import { MediaPlayerKey } from "../types";
import CapacitorVideoPlayer from "./CapacitorVideoPlayer.vue";

export const CapacitorPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: CapacitorVideoPlayer,
            capabilities: {
                backgroundAudio: true,
                offlineDownloads: true,
                nativeFullscreen: true,
            },
        });
    },
};
```

### 5. Registration in `main.ts`

Replace `loadPlugins()` (or run alongside it) with platform plugin registration. Dynamic import ensures Capacitor code is never bundled for the web build.

```typescript
import { isCapacitorPlatform } from "./platform/detect";

async function Startup() {
    // ... existing auth + init code ...

    // Register the platform-appropriate media player
    if (isCapacitorPlatform()) {
        const { CapacitorPlatformPlugin } = await import("./platform/capacitor");
        app.use(CapacitorPlatformPlugin);
    } else {
        const { WebPlatformPlugin } = await import("./platform/web");
        app.use(WebPlatformPlugin);
    }

    app.use(createPinia());
    app.use(router);
    app.use(i18n);
    app.mount("#app");
    // ...
}
```

### 6. Consumer Composable (`composables/useMediaPlayer.ts`)

One composable is all consumer components ever need.

```typescript
import { inject } from "vue";
import { MediaPlayerKey, type MediaPlayerService } from "@/platform/types";

export function useMediaPlayer(): MediaPlayerService {
    const player = inject(MediaPlayerKey);
    if (!player) {
        throw new Error(
            "useMediaPlayer() called before a platform plugin was installed via app.use(). " +
            "Make sure WebPlatformPlugin or CapacitorPlatformPlugin is registered in main.ts.",
        );
    }
    return player;
}
```

### 7. Consumer Usage (`SingleContent.vue`)

```vue
<script setup lang="ts">
import { useMediaPlayer } from "@/composables/useMediaPlayer";

const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
    <!-- Works the same regardless of which implementation is injected -->
    <component :is="VideoPlayer" :content="content" :language="currentLanguage" />

    <!-- Gate platform-specific UI behind capabilities -->
    <DownloadButton v-if="capabilities.offlineDownloads" :content="content" />
</template>
```

---

## Improving the Existing `pluginLoader.ts`

The existing loader can be kept for **external/runtime** plugins (plugins that are copied in at build time via `VITE_PLUGIN_PATH`). Improve it to:

1. Accept the `App` instance.
2. Call `app.use()` if the class has an `install()` method (making it a proper Vue plugin).
3. Export a typed `LuminaryPlugin` base interface.

```typescript
// util/pluginLoader.ts
import type { App } from "vue";

/**
 * Interface that external plugins should implement.
 * A plugin may optionally be a Vue plugin (by implementing install()).
 */
export interface LuminaryPlugin {
    install?(app: App): void;
}

export const loadPlugins = async (app: App): Promise<void> => {
    if (!import.meta.env.VITE_PLUGINS) return;

    const names: string[] = JSON.parse(import.meta.env.VITE_PLUGINS);
    await Promise.all(names.map((name) => loadPlugin(app, name)));
};

const loadPlugin = async (app: App, name: string): Promise<void> => {
    try {
        const module = await import(`../plugins/${name}.ts`);
        const PluginClass = module[name];

        if (!PluginClass) {
            console.error(`Plugin "${name}" not found or has no matching export.`);
            return;
        }

        const instance: LuminaryPlugin = new PluginClass();

        if (typeof instance.install === "function") {
            app.use({ install: (a) => instance.install!(a) });
        }
    } catch (err: any) {
        console.error(`Failed to load plugin "${name}":`, err.message);
    }
};
```

Update `main.ts` to pass `app`:

```typescript
await loadPlugins(app); // was: await loadPlugins()
```

---

## Extending to Other Services

The same pattern applies to any future pluggable service. Add an injection key and type to `platform/types.ts` and register additional `app.provide()` calls in each platform plugin:

```typescript
// platform/types.ts (extended example)
export type DownloadService = {
    download(content: ContentDto): Promise<void>;
    listDownloads(): Promise<ContentDto[]>;
    deleteDownload(contentId: string): Promise<void>;
};

export const DownloadServiceKey: InjectionKey<DownloadService> = Symbol("download-service");
```

```typescript
// composables/useDownloads.ts
export function useDownloads(): DownloadService {
    const service = inject(DownloadServiceKey);
    if (!service) throw new Error("No DownloadService registered for this platform.");
    return service;
}
```

The web platform plugin provides a no-op implementation; the Capacitor plugin provides the real one. Consumer components never change.

---

## Migration Steps

1. Create `app/src/platform/types.ts` with the interfaces above.
2. Create `app/src/platform/detect.ts`.
3. Move `VideoPlayer.vue` → `app/src/platform/web/WebVideoPlayer.vue` (no code changes).
4. Create `app/src/platform/web/index.ts` (WebPlatformPlugin).
5. Create `app/src/platform/capacitor/index.ts` (CapacitorPlatformPlugin — stub, same component as web for now).
6. Create `app/src/composables/useMediaPlayer.ts`.
7. Update `main.ts`: replace current `loadPlugins()` call with platform detection and `app.use()`.
8. Update `pluginLoader.ts` to accept `App` and call `app.use()` on plugins that have `install()`.
9. Update `SingleContent.vue` to use `useMediaPlayer()` instead of importing `VideoPlayer.vue` directly.
10. Delete `app/src/plugins/examplePlugin.ts`.

---

## What This Achieves

| Concern | Before | After |
|---|---|---|
| Platform selection | Manual, ad-hoc | `app.use()` at startup |
| Consumer coupling | Direct import of `VideoPlayer.vue` | `inject(MediaPlayerKey)` |
| Adding a new platform | No path | Implement the interface, register in `main.ts` |
| Feature gating | Hard-coded per component | `capabilities.offlineDownloads` flag |
| External plugins | Class instantiation only | Full Vue plugin support via `install()` |
| TypeScript safety | No explicit service API | Typed `InjectionKey<T>` |
