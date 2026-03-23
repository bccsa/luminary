# Platform Plugin System

## What is this?

Some features of the app behave fundamentally differently depending on the runtime:

| Feature | Web / PWA | Capacitor (native) |
|---|---|---|
| Video playback | Video.js (HTML5) | Native OS player |
| Background audio | Not reliably possible | OS media session |
| Offline downloads | Not app-managed | Device Filesystem API |

This system solves that by letting each runtime register its own service implementations once at startup. App components never check `if (isNative)` — they call a composable and get the right implementation automatically.

---

## How it works in 4 steps

```
1. Service API defined        platform/types/mediaPlayer.ts
         │
         ▼
2. Platform plugin provides   platform/web/index.ts
   implementations            platform/capacitor/index.ts
         │
         ▼
3. App startup selects        main.ts
   the right plugin
         │
         ▼
4. Components consume         composables/useMediaPlayer.ts
   via composable             → inject(MediaPlayerKey)
```

### Step 1 — Define a Service API (`platform/types/`)

Each service is described as a TypeScript type paired with a typed injection key. This is the only file consumers ever import from this folder.

```ts
// platform/types/mediaPlayer.ts
export type MediaPlayerService = {
    VideoPlayer: Component;
    capabilities: PlatformCapabilities;
};

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("media-player");
```

### Step 2 — Provide platform implementations (`platform/web/`, `platform/capacitor/`)

Each platform is a standard Vue plugin. Its `install()` method provides the service for its runtime.

```ts
// platform/web/index.ts
export const WebPlatformPlugin: Plugin = {
    install(app: App) {
        app.provide(MediaPlayerKey, {
            VideoPlayer: WebVideoPlayer,
            capabilities: { playback: { backgroundAudio: false, ... }, ... },
        });
    },
};
```

The Capacitor plugin does the same but provides native implementations and sets its capability flags accordingly.

### Step 3 — Select the plugin at startup (`main.ts`)

```ts
if (isCapacitorPlatform()) {
    const { CapacitorPlatformPlugin } = await import("./platform/capacitor");
    app.use(CapacitorPlatformPlugin);
} else {
    const { WebPlatformPlugin } = await import("./platform/web");
    app.use(WebPlatformPlugin);
}
```

Dynamic `import()` ensures neither bundle is downloaded by the wrong platform.

### Step 4 — Consume via composable (`composables/`)

Components call a composable. They never import platform files directly.

```ts
// composables/useMediaPlayer.ts
export function useMediaPlayer(): MediaPlayerService {
    const service = inject(MediaPlayerKey);
    if (!service) throw new Error("No platform plugin installed.");
    return service;
}
```

```vue
<!-- Any component — no platform knowledge here -->
<script setup>
const { VideoPlayer, capabilities } = useMediaPlayer();
</script>

<template>
    <component :is="VideoPlayer" :content="content" :audioTrackLanguage="lang" />
    <DownloadButton v-if="capabilities.offline.downloads" :content="content" />
</template>
```

---

## Folder structure

```
platform/
  detect.ts                         ← isCapacitorPlatform() helper
  types/
    index.ts                        ← barrel export (add a line here per new service)
    mediaPlayer.ts                  ← MediaPlayerService type + MediaPlayerKey
  web/
    index.ts                        ← WebPlatformPlugin
    WebVideoPlayer.vue              ← Video.js player
    WebVideoPlayer.css              ← Video.js styles
    WebVideoPlayer.spec.ts
  capacitor/
    index.ts                        ← CapacitorPlatformPlugin
    CapacitorVideoPlayer.vue        ← Native player (stub — replace with real implementation)
```

---

## Current service: Media Player

`MediaPlayerService` exposes:

- **`VideoPlayer`** — the component to render (web: Video.js, native: OS player)
- **`capabilities`** — platform feature flags:

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

Use `capabilities` flags to show or hide platform-specific UI without platform checks in components.

---

## Adding a new service (quick reference)

```ts
// 1. platform/types/myService.ts
export type MyService = { doSomething(): void };
export const MyServiceKey: InjectionKey<MyService> = Symbol("my-service");

// 2. platform/types/index.ts — add one line:
export * from "./myService";

// 3. platform/web/index.ts — provide web implementation:
app.provide(MyServiceKey, new WebMyService());

// 4. platform/capacitor/index.ts — provide native implementation:
app.provide(MyServiceKey, new CapacitorMyService());

// 5. composables/useMyService.ts
export function useMyService(): MyService {
    const service = inject(MyServiceKey);
    if (!service) throw new Error("No MyService registered.");
    return service;
}
```

No changes needed in `main.ts`, `detect.ts`, or any existing component.

---

## Relationship to `VITE_PLUGINS`

These are two different systems that serve different purposes:

| | Platform plugins (`platform/`) | `VITE_PLUGINS` (`src/plugins/`) |
|---|---|---|
| **Purpose** | Runtime differences (web vs. native) | Organisation-specific customisation |
| **When active** | Always — exactly one per build | Optional — 0..n per build |
| **Added by** | Core team | Deploying organisation |
| **Examples** | Video player, downloads, audio | Analytics, branding, feature flags |

Startup order in `main.ts`:
1. Platform plugin runs first (registers all platform services).
2. `VITE_PLUGINS` run second (can optionally override any service by calling `app.provide()` with the same key).

---

## Testing

Mock the composable at the module level. No Vue providers needed:

```ts
vi.mock("@/composables/useMediaPlayer", () => ({
    useMediaPlayer: () => ({
        VideoPlayer: { template: "<div />" },
        capabilities: {
            playback: {
                nativePlayback: false, nativeFullscreen: false,
                pictureInPicture: true, backgroundAudio: false,
                seekControl: true, playbackRateControl: true,
            },
            tracks: { audioTrackSelection: true },
            offline: { downloads: false, progressTracking: false, deleteDownloadedMedia: false },
        },
    }),
}));
```

Platform implementations are tested in isolation in their own spec files (e.g. `WebVideoPlayer.spec.ts`).

---

## Design rules

1. **Components import composables, not `platform/*` files.**
2. **No `if (isNative)` in components.** Use capability flags instead.
3. **Each platform plugin provides every registered service.** If it doesn't apply, provide a no-op.
4. **Add a capability flag only when something in the UI needs to branch on it.**
