# Platform Plugin System

## TL;DR

- This system hides platform differences (Web vs Capacitor) behind typed services.
- `main.ts` installs one platform plugin at startup (`web` or `capacitor`).
- Platform plugins call `app.provide(...)`; app components call composables (`inject(...)`).
- Components never branch on `isNative`; they use `capabilities` flags instead.
- `VITE_PLUGINS` is a separate extension mechanism for org-specific overrides.

## Start Here

When adding a new pluggable service:

1. Add its type + injection key in `platform/types/`.
2. Export it from `platform/types/index.ts`.
3. Provide web/native implementations in `platform/web/index.ts` and `platform/capacitor/index.ts`.
4. Create a composable (e.g. `useDownloads()`).
5. Use the composable in components.

When adding a new platform:

1. Add `platform/<new-platform>/index.ts` and implementations.
2. Extend platform detection in `main.ts`.

---

## Why This Exists

Some features behave differently between browser and native shells:

| Feature | Web / PWA | Capacitor |
|---|---|---|
| Video playback | Video.js / HTML media | Native player |
| Background audio | Limited/unreliable | OS-native handling |
| Offline downloads | Usually not app-managed | Filesystem + background support |

Without this layer, platform checks spread across components and become hard to maintain.

---

## Core Architecture

### 1) Service API (`platform/types/`)

Each service has:
- a TypeScript interface/type
- an `InjectionKey`

```ts
export type SomeService = { doSomething(): void };
export const SomeServiceKey: InjectionKey<SomeService> = Symbol("some-service");
```

### 2) Platform plugins (`platform/web`, `platform/capacitor`)

Each plugin registers platform-specific implementations through `provide`:

```ts
export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(SomeServiceKey, new WebSomeService());
    },
};
```

### 3) Startup registration (`main.ts`)

```ts
if (isCapacitorPlatform()) {
    const { CapacitorPlatformPlugin } = await import("./platform/capacitor");
    app.use(CapacitorPlatformPlugin);
} else {
    const { WebPlatformPlugin } = await import("./platform/web");
    app.use(WebPlatformPlugin);
}
```

### 4) Composable consumption

Components use composables, not concrete platform files:

```ts
export function useSomeService(): SomeService {
    const service = inject(SomeServiceKey);
    if (!service) throw new Error("No SomeService registered for this platform.");
    return service;
}
```

---

## Current Example: Media Player

Current service: `MediaPlayerService` via `MediaPlayerKey`.

`MediaPlayerService` currently exposes:
- `VideoPlayer` component (web/native implementation)
- `capabilities`:
  - `playback.nativePlayback`
  - `playback.nativeFullscreen`
  - `playback.pictureInPicture`
  - `playback.backgroundAudio`
  - `playback.seekControl`
  - `playback.playbackRateControl`
  - `tracks.audioTrackSelection`
  - `offline.downloads`
  - `offline.progressTracking`
  - `offline.deleteDownloadedMedia`

Usage:

```vue
<script setup>
const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
    <component :is="VideoPlayer" :content="content" :audioTrackLanguage="audioTrackLanguage" />
    <DownloadButton v-if="capabilities.offline.downloads" :content="content" />
</template>
```

---

## Quick End-to-End Example (New Service)

```ts
// 1) types/downloads.ts
export type DownloadService = {
    download(contentId: string): Promise<void>;
    delete(contentId: string): Promise<void>;
};
export const DownloadServiceKey: InjectionKey<DownloadService> = Symbol("download-service");

// 2) platform/web/index.ts
app.provide(DownloadServiceKey, new WebDownloadService());

// 3) platform/capacitor/index.ts
app.provide(DownloadServiceKey, new CapacitorDownloadService());

// 4) composables/useDownloads.ts
export function useDownloads() {
  const service = inject(DownloadServiceKey);
  if (!service) throw new Error("No DownloadService registered.");
  return service;
}
```

---

## `VITE_PLUGINS` vs Platform Plugins

These are different systems:

| | Platform plugins (`platform/`) | `VITE_PLUGINS` (`src/plugins/`) |
|---|---|---|
| Purpose | Runtime environment differences | Organization-specific customization |
| Active | Always (one chosen at startup) | Optional (0..n plugins) |
| Typical use | Media, storage, platform behavior | Branding, analytics, custom integrations |

Startup order in `main.ts`:

1. Install platform plugin.
2. Load `VITE_PLUGINS`.

This allows external plugins to override provided services intentionally.

---

## Testing

Mock composables, not platform internals:

```ts
vi.mock("@/composables/useMediaPlayer", () => ({
  useMediaPlayer: () => ({
    VideoPlayer: { template: "<div />" },
    capabilities: {
      playback: {
        nativePlayback: false,
        nativeFullscreen: false,
        pictureInPicture: true,
        backgroundAudio: false,
        seekControl: true,
        playbackRateControl: true,
      },
      tracks: { audioTrackSelection: true },
      offline: { downloads: false, progressTracking: false, deleteDownloadedMedia: false },
    },
  }),
}));
```

---

## Design Rules

1. Components use composables, not `platform/*` imports.
2. Platform differences go through typed `InjectionKey` service APIs.
3. Platform plugins provide implementations; components stay platform-agnostic.
4. Add capability flags only when UI/logic needs to branch on them.
