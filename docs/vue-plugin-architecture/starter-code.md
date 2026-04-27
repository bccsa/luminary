# Starter code (example: media player)

The **[architecture README](./README.md)** explains the pattern in general. This file uses the **global media player** — the first plugin in the repo wired this way — as a **concrete walkthrough**: **`virtual:media-player`**, **`app/src/build-time-plugin-contracts/media-player/`**, **`app/src/build-time-plugins/media-player/`**, **`app/src/build-time-plugin-contracts/plugin-registry.ts`**, and **`app/vite-plugins/buildTargetVirtuals.ts`**.

Snippets are **shortened**; copy the real `contract.ts` from the repo when in doubt.

---

## 1) Vite: resolve the virtual module

`app/vite-plugins/buildTargetVirtuals.ts` (simplified):

```ts
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

export function buildTargetVirtuals(): Plugin {
    const root = fileURLToPath(new URL("../src", import.meta.url));

    return {
        name: "build-target-virtuals",
        resolveId(id) {
            if (id === "virtual:media-player") {
                return `${root}/build-time-plugins/media-player/index.ts`;
            }
        },
    };
}
```

Register `buildTargetVirtuals()` in `vite.config.ts` (see repo).

---

## 2) Contract and token

**`app/src/build-time-plugin-contracts/media-player/contract.ts`** — define `MediaPlayerService` (see production file for the full API).

**`app/src/build-time-plugin-contracts/media-player/token.ts`**:

```ts
import type { InjectionKey } from "vue";
import type { MediaPlayerService } from "./contract";

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("MediaPlayerService");
```

UI and tests import **`MediaPlayerKey` from here**, not from `plugin-registry`, so the module graph does not cycle through `virtual:media-player` when the web adapter references `AudioPlayer.vue`.

---

## 3) Web adapter (no default import of `AudioPlayer` in the class)

**`app/src/build-time-plugins/media-player/media-player-web.ts`** — implement `MediaPlayerService`. Pass the shell component **into the constructor** (see production class). Do **not** import `AudioPlayer.vue` inside this file; that keeps wiring in `index.ts`.

```ts
import type { Component } from "vue";
import type { MediaPlayerService, MediaPlayerState } from "../../build-time-plugin-contracts/media-player/contract";

export class WebMediaPlayerService implements MediaPlayerService {
    readonly supportsBackgroundPlayback = false;
    // … state, audio element wiring — see repo

    constructor(private readonly playerComponent: Component) {}

    getGlobalAudioPlayerComponent(): Component {
        return this.playerComponent;
    }

    // attachAudioElement, play, pause, …
}
```

---

## 4) Web entry: install + default shell

**`app/src/build-time-plugins/media-player/index.ts`**:

```ts
import type { App, Component } from "vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token";
import type { MediaPlayerService } from "@/build-time-plugin-contracts/media-player/contract";
import { WebMediaPlayerService } from "./media-player-web";

export interface MediaPlayerInstallOptions {
    audioPlayerComponent?: Component;
}

export function createMediaPlayerService(options: MediaPlayerInstallOptions = {}): MediaPlayerService {
    return new WebMediaPlayerService(options.audioPlayerComponent ?? AudioPlayer);
}

export function installMediaPlayer(app: App, options: MediaPlayerInstallOptions = {}): void {
    app.provide(MediaPlayerKey, createMediaPlayerService(options));
}

export { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token";
export type { MediaPlayerService, MediaPlayerState, NowPlayingInfo } from "@/build-time-plugin-contracts/media-player/contract";
```

---

## 5) App registry

**`app/src/build-time-plugin-contracts/plugin-registry.ts`**:

```ts
import type { App } from "vue";
import { installMediaPlayer, MediaPlayerKey } from "virtual:media-player";

export function installPlugins(app: App): void {
    installMediaPlayer(app);
}

export const plugins = {
    mediaPlayer: { install: installMediaPlayer, MediaPlayerKey },
} as const;

export { installMediaPlayer, MediaPlayerKey };
export type { MediaPlayerService } from "@/build-time-plugin-contracts/media-player/contract";

export const appPluginsPlugin = {
    install(app: App) {
        installPlugins(app);
    },
};
```

---

## 6) Bootstrap

**`main.ts`** (extract):

```ts
import { appPluginsPlugin } from "@/build-time-plugin-contracts/plugin-registry";

// … after router, i18n, etc.
app.use(appPluginsPlugin);
```

---

## 7) Feature consumer

```vue
<script setup lang="ts">
import { inject } from "vue";
import { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token";

const mediaPlayerService = inject(MediaPlayerKey);
if (!mediaPlayerService) throw new Error("MediaPlayerService not provided");
</script>
```

---

## 8) Adding another plugin (same pattern)

The media player is **one** `virtual:…` plugin. A second concern (e.g. **`auth-callback`**, **`downloads`**) repeats the same steps — see **[Adding another plugin](./README.md#adding-another-plugin)** in the architecture README for the full checklist and diagram.

Short version:

1. **`app/src/build-time-plugin-contracts/<name>/`** — `contract.ts`, `token.ts`.
2. **`app/src/build-time-plugins/<name>/`** — `<name>-web.ts`, `index.ts` with `install…` + `provide`.
3. **`buildTargetVirtuals.ts`** — `resolveId("virtual:<name>")` → `build-time-plugins/<name>/index.ts`.
4. **`env.d.ts`** — `declare module "virtual:<name>" { … }`.
5. **`plugin-registry.ts`** — `import { install… } from "virtual:<name>"` and call it in `installPlugins`.
6. Components — `inject` using `@/build-time-plugin-contracts/<name>/token`.

The **contract** in `build-time-plugin-contracts/` is the stable surface that UI code depends on — the implementation in `build-time-plugins/` can be replaced without touching any consumer.
