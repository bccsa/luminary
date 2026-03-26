# Platform Plugin System

## The big picture

The app runs in two different environments:

- **Web / PWA** — runs in a browser. Has no access to native device APIs.
- **Capacitor (iOS / Android)** — wraps the app in a native shell. Has access to the filesystem, native media player, background audio, etc.

Some features work differently — or not at all — depending on the environment. The goal of this system is to let **components stay the same** regardless of the environment. They call a composable, get the right implementation back, and never need to check which platform they are on.

---

## Architecture diagram

Open [`docs/vue-platform-plugin-architecture.drawio.svg`](../../../docs/vue-platform-plugin-architecture.drawio.svg) in VS Code (draw.io extension) or on GitHub.

The diagram shows the full system as a grid: each column is a layer (contracts → web defaults → Capacitor overrides), each row is one service.

---

## How the two repositories connect

```
luminary-deployment/
│
├── luminary/                        ← this repo (git submodule)
│   └── app/src/
│       ├── platform/                ← service contracts + web defaults
│       ├── plugins/                 ← empty in source, populated at build time
│       └── main.ts                  ← exports `app`, registers WebPlatformPlugin
│
└── luminary-plugins/                ← Capacitor implementations
    ├── CapacitorPlatformPlugin.ts
    └── NativeVideoPlayer.vue
```

At **build time**, Vite copies every file from `VITE_PLUGIN_PATH` (pointing to `luminary-plugins/`) into `luminary/app/src/plugins/`. By the time the app runs, both repos are one compiled bundle.

---

## Startup sequence

`main.ts` runs these steps in order before mounting the app:

**Step 1 — Register web defaults**
```
app.use(WebPlatformPlugin)
  → app.provide(MediaPlayerKey,      { VideoPlayer: VideoPlayer, capabilities: web })
  → app.provide(FileStorageKey,      WebFileStorageService   — no-op)
  → app.provide(DownloadMetadataKey, WebDownloadMetadataService — localStorage)
```

**Step 2 — Load deployment plugins (may override step 1)**
```
loadPlugins()  reads VITE_PLUGINS environment variable

  On a Capacitor build, this includes CapacitorPlatformPlugin:
  → new CapacitorPlatformPlugin()   calls app.provide() for all three keys
  → app.provide(MediaPlayerKey,      { VideoPlayer: NativeVideoPlayer, capabilities: native })
  → app.provide(FileStorageKey,      CapacitorFileStorageService  — @capacitor/filesystem)
  → app.provide(DownloadMetadataKey, CapacitorDownloadMetadataService — @capacitor/preferences)

  Vue uses the last registered value for each key — Capacitor values replace web defaults.
```

**Step 3 — Mount**
```
app.mount("#app")  → components inject the correct implementation for this build
```

> **Why constructor, not `app.use()`?**
> `WebPlatformPlugin` uses Vue's standard `app.use()` / `install(app)` pattern.
> `CapacitorPlatformPlugin` uses a constructor that calls `app.provide()` directly on the `app`
> instance exported from `main.ts`. This is how all the other `luminary-plugins/` plugins work —
> `pluginLoader.ts` discovers and runs them with `new PluginClass()`.

---

## A concrete example

Without this system, every component that touches platform features becomes a mess:

```vue
<!-- ❌ before -->
<VideoPlayer v-if="isWeb" ... />
<NativeVideoPlayer v-else ... />
```

With this system, the component never checks the platform:

```vue
<!-- ✅ after -->
<script setup>
const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
  <component :is="VideoPlayer" :content="content" />

  <!-- shown only on Capacitor — no platform check needed -->
  <DownloadButton v-if="capabilities.offline.downloads" />
</template>
```

---

## The three layers

### Layer 1 — Contracts (`platform/types/`)

TypeScript interfaces only — no logic, no imports from `@capacitor/*`. These are the single source of truth for what each service can do.

### Layer 2 — Web implementations (`platform/web/`)

Default implementations active on every build:

| File | Behaviour |
|---|---|
| `components/content/VideoPlayer.vue` | Video.js HTML5 / HLS player |
| `WebFileStorageService.ts` | No-op — browser has no app-private file API |
| `WebDownloadMetadataService.ts` | `localStorage` — for local dev and testing parity |

### Layer 3 — Capacitor overrides (`luminary-deployment/luminary-plugins/`)

Native implementations that replace web defaults on Capacitor builds:

| File | Behaviour |
|---|---|
| `NativeVideoPlayer.vue` | Tappable thumbnail — tapping launches AVPlayer (iOS) / ExoPlayer (Android) in fullscreen |
| `CapacitorFileStorageService` | `@capacitor/filesystem` — `Directory.Data` (private app sandbox) |
| `CapacitorDownloadMetadataService` | `@capacitor/preferences` — UserDefaults (iOS) / SharedPreferences (Android) |

---

## Current services

### `MediaPlayerService`

```ts
const { VideoPlayer, capabilities } = useMediaPlayer();
```

**Capability flags:**

| Flag | Web | Capacitor |
|---|---|---|
| `playback.nativePlayback` | `false` | `true` |
| `playback.nativeFullscreen` | `false` | `true` |
| `playback.pictureInPicture` | `true` | `true` |
| `playback.backgroundAudio` | `false` | `true` |
| `playback.seekControl` | `true` | `true` |
| `playback.playbackRateControl` | `true` | `false` — managed by native player UI |
| `tracks.audioTrackSelection` | `true` | `false` — managed by native player UI |
| `offline.downloads` | `false` | `true` |
| `offline.progressTracking` | `false` | `true` |
| `offline.deleteDownloadedMedia` | `false` | `true` |

### `AudioPlayerService`

```ts
const { AudioPlayer, capabilities } = useAudioPlayer();
```

`AudioPlayer` is rendered globally in `App.vue` and binds the current queue item via:

```vue
<component :is="AudioPlayer" v-model:content="mediaQueue[0]" />
```

**Capability flags:**

| Flag | Web | Capacitor |
|---|---|---|
| `backgroundAudio` | `false` | `true` *(when a native AudioPlayer override is implemented)* |
| `playbackRateControl` | `true` | `true` *(depends on native player UI)* |

### `FileStorageService`

```ts
const storage = useFileStorage();

await storage.saveFile(contentId, blob);
await storage.hasFile(contentId);          // check before offline playback
await storage.getFileUri(contentId);       // local URI to pass to the player
await storage.getFileSize(contentId);      // show storage usage in UI
await storage.deleteFile(contentId);
```

### `DownloadMetadataService`

```ts
const meta = useDownloadMetadata();

await meta.setDownload({ contentId, status: "downloading", progress: 0 });
await meta.setDownloadProgress(contentId, 45);
await meta.listDownloads();                // render the downloads page
await meta.removeDownload(contentId);
```

---

## Offline download flow

```
User taps "Download"
  1. meta.setDownload({ contentId, status: "downloading", progress: 0 })
  2. File transfer begins → on progress → meta.setDownloadProgress(contentId, n)
  3. Complete → storage.saveFile(contentId, blob)
  4.          → meta.setDownload({ status: "complete", fileSizeBytes, downloadedAt })

"My Downloads" screen
  → meta.listDownloads()  renders list with title, size, delete button

User taps "Delete"
  → storage.deleteFile(contentId)
  → meta.removeDownload(contentId)

Offline playback
  → storage.hasFile(contentId) === true
  → pass storage.getFileUri(contentId) to the player instead of the streaming URL
```

---

## File structure

```
platform/
  types/
    index.ts
    mediaPlayer.ts              MediaPlayerService · VideoPlayerProps · PlatformCapabilities · MediaPlayerKey
    fileStorage.ts              FileStorageService · FileStorageKey
    downloadMetadata.ts         DownloadMetadataService · DownloadEntry · DownloadStatus · DownloadMetadataKey

  web/
    index.ts                    WebPlatformPlugin
    (provides) components/content/VideoPlayer.vue  Video.js player (web default)
    WebFileStorageService.ts    no-op
    WebDownloadMetadataService.ts  localStorage

composables/
  useMediaPlayer.ts             inject(MediaPlayerKey)
  useFileStorage.ts             inject(FileStorageKey)
  useDownloadMetadata.ts        inject(DownloadMetadataKey)
```

Capacitor implementations live in `luminary-deployment/luminary-plugins/` — not in this repo.

---

## Adding a new service

> `main.ts` does **not** need to change.

1. `src/platform/types/myService.ts` — TypeScript interface + `InjectionKey`
2. `src/platform/types/index.ts` — add `export * from "./myService"`
3. `src/platform/web/WebMyService.ts` — web implementation (can be no-op)
4. `src/platform/web/index.ts` — add `app.provide(MyServiceKey, new WebMyService())` inside `WebPlatformPlugin`
5. `src/composables/useMyService.ts` — `export function useMyService() { return inject(MyServiceKey)! }`
6. `luminary-deployment/luminary-plugins/CapacitorPlatformPlugin.ts` — add `app.provide(MyServiceKey, new CapacitorMyService())`

---

## Testing

Mock the composable — never set up Vue providers in tests:

```ts
vi.mock("@/composables/useMediaPlayer", () => ({
    useMediaPlayer: () => ({
        VideoPlayer: { template: "<div data-testid='video-player' />" },
        capabilities: {
            playback: { nativePlayback: false, nativeFullscreen: false, pictureInPicture: true,
                        backgroundAudio: false, seekControl: true, playbackRateControl: true },
            tracks:   { audioTrackSelection: true },
            offline:  { downloads: false, progressTracking: false, deleteDownloadedMedia: false },
        },
    }),
}));
```

---

## Rules

1. **Components import composables, never `platform/*` directly.**
2. **No `if (isNative)` in components.** Use capability flags instead.
3. **If a file imports `@capacitor/*`, it belongs in `luminary-deployment`**, not this repo.
4. **Every service must have a web implementation**, even if it is a no-op.
5. **Add a capability flag only when the UI needs to branch on it.**
