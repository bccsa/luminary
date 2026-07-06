# Vue Plugin Architecture — Media Player Deep Dive

This document walks through the `media-player` plugin as the reference implementation of Luminary's build-time plugin system. It follows the same structure as [`demo-banner-meeting.md`](./demo-banner-meeting.md) but covers the real-world complexity: a stateful service, a two-component architecture, and an audio element lifecycle.

---

## The key idea

> **A plugin can expose a Vue component through its contract.**
> The app renders that component without ever importing the file.

```ts
// Any component in the app does this:
const mediaPlayerService = inject(MediaPlayerKey);
const PlayerComponent = mediaPlayerService.getGlobalAudioPlayerComponent();

// Then in the template:
// <component :is="PlayerComponent" />
```

`PlayerComponent` is `AudioPlayer.vue` — but the caller has no import for it, no path to it, no dependency on it. The plugin resolved that at build time. Swap the plugin and you swap the component everywhere, in one line.

---

## What the media player plugin does

The app needs a global audio player that:
- persists across page navigation (single `<audio>` element, no interruptions)
- can be swapped for a different implementation per build target (web vs native)
- lets any component in the tree control playback without knowing how audio works

No component imports `WebMediaPlayerService` or `AudioPlayer.vue` directly. Everything goes through the contract.

---

## The five pieces

```
1. contract.ts            ← TypeScript interface + state/event types
2. token.ts               ← Vue injection key
3. media-player-web.ts    ← Service implementation (drives HTMLAudioElement)
4. index.ts               ← Install entry point (provide + options)
5. buildTargetVirtuals.ts ← Vite: "virtual:media-player" → index.ts
```

Two Vue components complete the picture:
- **`WebMediaAudioElement.vue`** — a hidden `<audio>` tag that bridges the DOM to the service
- **`AudioPlayer.vue`** — the visible player UI (injected via the service; not imported directly)

---

## Walking through the files

### 1. Contract — what the plugin promises

```ts
// src/build-time/contracts/media-player/contract.ts

export type MediaPlayerState = {
    status: "idle" | "loading" | "playing" | "paused";
    isPlaying: boolean;
    currentTimeSeconds: number;
    durationSeconds: number;
    playbackRate: number;
};

export type NowPlayingInfo = {
    title: string;
    artist?: string;
    artworkUrl?: string;
    duration?: number;
};

export type MediaPlayerService = {
    readonly supportsBackgroundPlayback: boolean;
    getGlobalAudioPlayerComponent(): Component; // ← returns a Vue component; callers never import it directly
    attachAudioElement(audioElement: HTMLAudioElement): void;
    detachAudioElement(audioElement?: HTMLAudioElement): void;
    play(): Promise<void>;
    pause(): void;
    seekTo(seconds: number): void;
    seekBy(seconds: number): void;
    setPlaybackRate(rate: number): void;
    getState(): MediaPlayerState;
    onStateChange(cb: (state: MediaPlayerState) => void): () => void;
    setNowPlaying?(info: NowPlayingInfo): void;
};
```

This is the entire surface the rest of the app depends on. A native implementation would satisfy the same interface — the rest of the app changes nothing.

---

### 2. Token — the injection key

```ts
// src/build-time/contracts/media-player/token.ts
import type { InjectionKey } from "vue";
import type { MediaPlayerService } from "./contract";

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("MediaPlayerService");
```

Kept in a **separate file** from the virtual module so that UI components can import the key without pulling the full adapter dependency graph into their bundle.

---

### 3. Service implementation

```ts
// src/build-time/plugins/media-player/media-player-web.ts

export class WebMediaPlayerService implements MediaPlayerService {
    readonly supportsBackgroundPlayback = false;
    private audioElement: HTMLAudioElement | null = null;
    private listeners = new Set<(state: MediaPlayerState) => void>();
    private readonly state: MediaPlayerState = { status: "idle", ... };

    // Syncs internal state from the DOM element and notifies all subscribers
    private readonly syncStateFromElement = () => { ... };

    // Called by WebMediaAudioElement.vue on mount
    attachAudioElement(audioElement: HTMLAudioElement): void {
        this.audioElement = audioElement;
        this.audioElement.addEventListener("play", this.syncStateFromElement);
        this.audioElement.addEventListener("pause", this.syncStateFromElement);
        // ... timeupdate, loadedmetadata, ratechange, playing, ended, waiting
    }

    // Called by WebMediaAudioElement.vue on unmount
    detachAudioElement(audioElement?: HTMLAudioElement): void {
        // removes all listeners, nulls the reference
    }

    getGlobalAudioPlayerComponent(): Component {
        return this.playerComponent; // AudioPlayer.vue
    }

    // Delegates to the DOM element
    async play(): Promise<void> { await this.audioElement?.play(); }
    pause(): void { this.audioElement?.pause(); }
    seekTo(seconds: number): void { this.audioElement.currentTime = seconds; }

    // Pub/sub: any component can subscribe to state changes
    onStateChange(cb): () => void {
        this.listeners.add(cb);
        cb(this.getState());          // fires immediately with current state
        return () => this.listeners.delete(cb);
    }
}
```

Key design: the service **owns state** and **fans it out via listeners** — it is not a Vue reactive object, so it works identically in tests and in non-Vue contexts.

---

### 4. The two Vue components

#### `WebMediaAudioElement.vue` — the hidden audio bridge

```vue
<!-- src/build-time/plugins/media-player/WebMediaAudioElement.vue -->
<script setup lang="ts">
const mediaPlayerService = inject(MediaPlayerKey);

const audioRef = ref<HTMLAudioElement | null>(null);

onMounted(() => mediaPlayerService.attachAudioElement(audioRef.value!));
onUnmounted(() => mediaPlayerService.detachAudioElement(audioRef.value!));

defineExpose({ getAudioElement: () => audioRef.value });
</script>

<template>
    <audio ref="audioRef" :src="props.src" preload="auto" class="hidden" />
</template>
```

This is the only component that touches the DOM `<audio>` element. It tells the service "here is your element" on mount and "let it go" on unmount. The service attaches/detaches its event listeners accordingly.

#### `AudioPlayer.vue` — the visible UI

`AudioPlayer.vue` is the full player UI (playback controls, seek bar, volume, speed, languages). It:
- **injects** `MediaPlayerKey` to call `play()`, `pause()`, `seekTo()`, etc.
- **mounts** `WebMediaAudioElement` internally to own the `<audio>` lifecycle
- is returned by `getGlobalAudioPlayerComponent()` and rendered in `App.vue`

```ts
// Inside AudioPlayer.vue
const mediaPlayerService = inject(MediaPlayerKey);
// ...
mediaPlayerService.play();
mediaPlayerService.seekTo(30);
mediaPlayerService.setNowPlaying({ title, artist, artworkUrl });
```

```html
<!-- Inside AudioPlayer.vue template -->
<WebMediaAudioElement ref="audioSurfaceRef" :src="currentContent.audio" />
```

---

### 5. Install entry point

```ts
// src/build-time/plugins/media-player/index.ts

export function installMediaPlayer(app: App, options: MediaPlayerInstallOptions = {}): void {
    app.provide(MediaPlayerKey, createMediaPlayerService(options));
}

export function createMediaPlayerService(options = {}): MediaPlayerService {
    return new WebMediaPlayerService(options.audioPlayerComponent ?? AudioPlayer);
}
```

`options.audioPlayerComponent` lets the caller swap the UI shell while keeping the service — useful for embedding the player in a custom layout.

---

### 6. Vite wiring

```ts
// vite-plugins/buildTargetVirtuals.ts
const virtualTargets: Record<string, string> = {
    "virtual:media-player": `${root}/build-time/plugins/media-player/index.ts`,
    "virtual:demo-banner":  `${root}/build-time/plugins/demo-banner/index.ts`,
};
```

Changing the path here is how you swap the entire implementation for a different build target (e.g. pointing to a `media-player-native/index.ts` for Capacitor).

---

### 7. Registry

```ts
// src/build-time/contracts/plugin-registry.ts
import { installMediaPlayer, MediaPlayerKey } from "virtual:media-player";

export function installPlugins(app: App): void {
    installMediaPlayer(app);
    installDemoBanner(app);
}
```

`main.ts` calls `app.use(appPluginsManager)` once. All plugins are provided before mount.

---

### 8. Usage in App.vue — the component exposed by the plugin

```ts
// App.vue (script)
import { MediaPlayerKey } from "@/build-time/contracts/media-player/token";
//                             ↑ token only — no import of AudioPlayer.vue or WebMediaPlayerService

const mediaPlayerService = inject(MediaPlayerKey);
```

```html
<!-- App.vue (template) -->
<div v-if="mediaQueue.length > 0">
    <component :is="mediaPlayerService.getGlobalAudioPlayerComponent()" :content="mediaQueue[0]" />
</div>
```

`App.vue` has **no import for `AudioPlayer.vue`**. It calls `getGlobalAudioPlayerComponent()` and Vue renders whatever the plugin returned. The plugin is the only place that knows which component that is.

---

## The full flow at a glance

```
build time
──────────────────────────────────────────────────────────────
Vite sees "virtual:media-player"
  → resolves to plugins/media-player/index.ts
  → bundles WebMediaPlayerService + AudioPlayer.vue + WebMediaAudioElement.vue

runtime — bootstrap
──────────────────────────────────────────────────────────────
main.ts  →  app.use(appPluginsManager)
         →  installMediaPlayer(app)
         →  app.provide(MediaPlayerKey, new WebMediaPlayerService(AudioPlayer))

runtime — mount
──────────────────────────────────────────────────────────────
App.vue  →  inject(MediaPlayerKey)
         →  getGlobalAudioPlayerComponent()  →  AudioPlayer.vue
         →  <component :is="AudioPlayer" :content="..." />
         →  AudioPlayer mounts WebMediaAudioElement
         →  WebMediaAudioElement calls attachAudioElement(el)
         →  service starts listening to DOM audio events

runtime — playback
──────────────────────────────────────────────────────────────
user clicks play
  →  AudioPlayer calls mediaPlayerService.play()
  →  service calls audioElement.play()
  →  DOM fires "play" event
  →  syncStateFromElement() runs
  →  state snapshot emitted to all onStateChange subscribers
  →  AudioPlayer re-renders with isPlaying = true
```

---

## What this enables

| Scenario | How it works |
|---|---|
| Native background playback | Implement `MediaPlayerService` backed by the platform audio API; return `supportsBackgroundPlayback = true`; update one line in `buildTargetVirtuals.ts` |
| Custom player UI | Pass `audioPlayerComponent: MyCustomPlayer` to `installMediaPlayer` |
| Mock in tests | `provide: { [MediaPlayerKey]: { play: vi.fn(), getState: () => ({...}), ... } }` |
| Any component controls playback | `inject(MediaPlayerKey)` → call `play()`, `pause()`, `seekTo()` — no imports from the plugin folder |

---

## Files for this plugin

| File | Role |
|---|---|
| `src/build-time/contracts/media-player/contract.ts` | Interface + state/event types |
| `src/build-time/contracts/media-player/token.ts` | Injection key |
| `src/build-time/plugins/media-player/media-player-web.ts` | Service (drives `HTMLAudioElement`) |
| `src/build-time/plugins/media-player/WebMediaAudioElement.vue` | Hidden `<audio>` DOM bridge |
| `src/build-time/plugins/media-player/index.ts` | Install entry point |
| `src/components/content/AudioPlayer.vue` | Full player UI (injected, not imported by consumers) |
| `vite-plugins/buildTargetVirtuals.ts` | Virtual module mapping |
| `env.d.ts` | TypeScript module declaration |
| `src/build-time/contracts/plugin-registry.ts` | Bootstrap composition |
| `src/App.vue` | Injects service, renders global player |

---

## Further reading

- Minimal example of the same pattern: [`demo-banner-meeting.md`](./demo-banner-meeting.md)
- Full architecture docs: [`README.md`](./README.md)
- Detailed explainer with Q&A: [`plugin-system-explained.md`](./plugin-system-explained.md)
