# Platform Plugin System

## The big picture

The app runs in two different environments:

- **Web / PWA** — runs in a browser. Has no access to native device APIs.
- **Capacitor (iOS / Android)** — wraps the app in a native shell. Has access to the filesystem, native media player, background audio, etc.

Some features work differently — or not at all — depending on the environment. The goal of this system is to let **components stay the same** regardless of the environment. They call a composable, get the right implementation back, and never need to check which platform they are on.

---

## Architecture overview

```mermaid
flowchart TB
    A["① platform/types/\nContracts — TypeScript interfaces only\nMediaPlayerService · FileStorageService · DownloadMetadataService"]
    B["② platform/web/\nWeb defaults\nWebVideoPlayer · WebFileStorageService · WebDownloadMetadataService"]
    C["③ composables/\nuseMediaPlayer() · useFileStorage() · useDownloadMetadata()"]
    D["④ Vue components\ne.g. SingleContent.vue"]
    E["luminary-deployment/luminary-plugins/\nCapacitor overrides\nCapacitorPlatformPlugin.ts"]

    A --> B
    B --> C
    C --> D
    E -->|"copied into src/plugins/ at build time\napp.use() overrides web defaults"| C
```

---

## How the two repositories connect

```mermaid
flowchart LR
    subgraph deployment["luminary-deployment/"]
        subgraph luminary["luminary/  ← git submodule"]
            P["src/platform/\ncontracts + web defaults"]
            PL["src/plugins/\nempty in source\npopulated at build time"]
            M["main.ts"]
        end
        LP["luminary-plugins/\nCapacitorPlatformPlugin.ts"]
    end

    LP -->|"Vite copies files\nat build time"| PL
    PL -->|"loadPlugins(app)\ncalls app.use()"| M
```

> There is no runtime connection between the two repos. By the time the app runs, everything has been compiled into a single bundle.

---

## Startup sequence

```mermaid
sequenceDiagram
    participant main as main.ts
    participant vue as Vue app
    participant comp as Any component

    main->>vue: app.use(WebPlatformPlugin)
    Note over vue: MediaPlayerKey → WebVideoPlayer<br/>FileStorageKey → WebFileStorageService (no-op)<br/>DownloadMetadataKey → WebDownloadMetadataService (localStorage)

    alt Capacitor build only
        main->>vue: app.use(CapacitorPlatformPlugin)
        Note over vue: same keys, new values — last provide wins<br/>FileStorageKey → CapacitorFileStorageService<br/>DownloadMetadataKey → CapacitorDownloadMetadataService
    end

    main->>vue: app.mount("#app")
    comp->>vue: inject via useMediaPlayer() etc.
    vue-->>comp: correct implementation for this build
```

---

## Component usage

```mermaid
flowchart LR
    C["SingleContent.vue"]
    U["useMediaPlayer()"]
    WB["WebVideoPlayer\n+ web capabilities"]
    CB["native VideoPlayer\n+ native capabilities"]

    C -->|"const { VideoPlayer, capabilities } ="| U
    U -->|"web build"| WB
    U -->|"Capacitor build"| CB
    WB --> R["&lt;component :is='VideoPlayer' /&gt;"]
    CB --> R
```

---

## Service map

```mermaid
flowchart LR
    subgraph W["Web defaults  (platform/web/)"]
        W1["WebVideoPlayer\nVideo.js HTML5"]
        W2["WebFileStorageService\nno-op"]
        W3["WebDownloadMetadataService\nlocalStorage"]
    end

    subgraph C["Capacitor overrides  (luminary-plugins/)"]
        C1["VideoPlayer\nnative TBD"]
        C2["CapacitorFileStorageService\n@capacitor/filesystem"]
        C3["CapacitorDownloadMetadataService\n@capacitor/preferences"]
    end

    subgraph T["Contracts  (platform/types/)"]
        T1["MediaPlayerService"]
        T2["FileStorageService"]
        T3["DownloadMetadataService"]
    end

    T1 --- W1
    T2 --- W2
    T3 --- W3
    T1 --- C1
    T2 --- C2
    T3 --- C3
```

---

## Offline download flow

```mermaid
sequenceDiagram
    participant UI as UI component
    participant meta as DownloadMetadataService
    participant net as File transfer
    participant fs as FileStorageService

    UI->>meta: setDownload({ status: "downloading", progress: 0 })
    UI->>net: start download(url)

    loop on progress
        net-->>meta: setDownloadProgress(contentId, n)
    end

    net-->>fs: saveFile(contentId, blob)
    net-->>meta: setDownload({ status: "complete", fileSizeBytes })

    Note over UI: My Downloads screen
    UI->>meta: listDownloads()
    meta-->>UI: list with title, size, delete button

    Note over UI: User taps Delete
    UI->>fs: deleteFile(contentId)
    UI->>meta: removeDownload(contentId)

    Note over UI: Offline playback
    UI->>fs: hasFile(contentId) → true
    UI->>fs: getFileUri(contentId)
    fs-->>UI: native file URI → pass to player
```

---

## A concrete example

Without this system, every component that touches platform features becomes a mess:

```vue
<!-- ❌ before -->
<WebVideoPlayer v-if="isWeb" ... />
<CapacitorVideoPlayer v-else ... />
```

With this system, the component never checks the platform:

```vue
<!-- ✅ after -->
<script setup>
const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
  <component :is="VideoPlayer" :content="content" />

  <!-- shown only on Capacitor, no platform check needed -->
  <DownloadButton v-if="capabilities.offline.downloads" />
</template>
```

---

## Capability flags

| Flag | Web | Capacitor |
|---|---|---|
| `playback.nativePlayback` | `false` | `true` |
| `playback.nativeFullscreen` | `false` | `true` |
| `playback.pictureInPicture` | `true` | `true` |
| `playback.backgroundAudio` | `false` | `true` |
| `playback.seekControl` | `true` | `true` |
| `playback.playbackRateControl` | `true` | `true` |
| `tracks.audioTrackSelection` | `true` | `true` |
| `offline.downloads` | `false` | `true` |
| `offline.progressTracking` | `false` | `true` |
| `offline.deleteDownloadedMedia` | `false` | `true` |

---

## File structure

```
platform/
  types/
    index.ts                         re-exports everything — add one line per new service
    mediaPlayer.ts                   MediaPlayerService type + MediaPlayerKey
    fileStorage.ts                   FileStorageService type + FileStorageKey
    downloadMetadata.ts              DownloadMetadataService type + DownloadMetadataKey + DownloadEntry

  web/
    index.ts                         WebPlatformPlugin — registers all web implementations
    WebVideoPlayer.vue               Video.js player
    WebVideoPlayer.css               Video.js styles
    WebVideoPlayer.spec.ts           Player tests
    WebFileStorageService.ts         No-op implementation
    WebDownloadMetadataService.ts    localStorage implementation

composables/
  useMediaPlayer.ts                  → inject(MediaPlayerKey)
  useFileStorage.ts                  → inject(FileStorageKey)
  useDownloadMetadata.ts             → inject(DownloadMetadataKey)
```

The `platform/capacitor/` folder does **not** exist in this repo. All Capacitor implementations live in `luminary-deployment/luminary-plugins/`.

---

## Adding a new service

1. Create `src/platform/types/myService.ts` — define the TypeScript interface and export an `InjectionKey`.
2. Add `export * from "./myService"` to `src/platform/types/index.ts`.
3. Create `src/platform/web/WebMyService.ts` — implement the interface for the browser (can be no-op).
4. Register it inside `WebPlatformPlugin` in `src/platform/web/index.ts`.
5. Create `src/composables/useMyService.ts` — one line: `export const useMyService = () => inject(MyServiceKey)!`
6. In `luminary-deployment`, add the Capacitor implementation to `CapacitorPlatformPlugin.ts`.

`main.ts` does **not** need to change.

---

## Testing

Mock the composable — do not set up Vue providers in tests:

```ts
vi.mock("@/composables/useMediaPlayer", () => ({
    useMediaPlayer: () => ({
        VideoPlayer: { template: "<div data-testid='video-player' />" },
        capabilities: {
            playback: { nativePlayback: false, backgroundAudio: false, seekControl: true, playbackRateControl: true, pictureInPicture: true, nativeFullscreen: false },
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
3. **If a file imports `@capacitor/*`, it belongs in `luminary-deployment`**, not in this repo.
4. **Every service must have a web implementation**, even if it is a no-op.
5. **Add a capability flag only when the UI needs to branch on it.**
