# Starter code (example: media player)

The **[architecture README](./README.md)** explains the pattern in general. This file uses the **global media player** — the first plugin in the repo wired this way — as a **concrete walkthrough**: **`virtual:media-player`**, **`BUILD_TARGET`**, **`app/src/plugins/media-player/`**, **`app/src/core/plugin-registry.ts`**, and **`app/vite-plugins/buildTargetVirtuals.ts`**.

Snippets are **shortened**; copy the real `contract.ts` from the repo when in doubt.

---

## 1) Vite: resolve the virtual module

`app/vite-plugins/buildTargetVirtuals.ts` (simplified):

```ts
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import type { Plugin } from "vite";

export function buildTargetVirtuals(): Plugin {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    let buildTarget = "web";

    return {
        name: "build-target-virtuals",
        config(_userConfig, env) {
            const loaded = loadEnv(env.mode, process.cwd(), "");
            buildTarget = loaded.BUILD_TARGET || "web";
        },
        resolveId(id) {
            if (id === "virtual:media-player") {
                return `${root}/plugins/media-player/${buildTarget}/index.ts`;
            }
        },
    };
}
```

Register `buildTargetVirtuals()` in `vite.config.ts` (see repo).

---

## 2) Contract and token

**`app/src/plugins/media-player/contract.ts`** — define `MediaPlayerService` (see production file for the full API).

**`app/src/plugins/media-player/token.ts`**:

```ts
import type { InjectionKey } from "vue";
import type { MediaPlayerService } from "./contract";

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("MediaPlayerService");
```

UI and tests import **`MediaPlayerKey` from here**, not from `plugin-registry`, so the module graph does not cycle through `virtual:media-player` when the web adapter references `AudioPlayer.vue`.

---

## 3) Web adapter (no default import of `AudioPlayer` in the class)

**`app/src/plugins/media-player/web/media-player.web.ts`** — implement `MediaPlayerService`. Pass the shell component **into the constructor** (see production class). Do **not** import `AudioPlayer.vue` inside this file; that keeps wiring in `index.ts`.

```ts
import type { Component } from "vue";
import type { MediaPlayerService, MediaPlayerState } from "../contract";

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

**`app/src/plugins/media-player/web/index.ts`**:

```ts
import type { App, Component } from "vue";
import AudioPlayer from "@/components/content/AudioPlayer.vue";
import { MediaPlayerKey } from "../token";
import type { MediaPlayerService } from "../contract";
import { WebMediaPlayerService } from "./media-player.web";

export interface MediaPlayerInstallOptions {
    audioPlayerComponent?: Component;
}

export function createMediaPlayerService(options: MediaPlayerInstallOptions = {}): MediaPlayerService {
    return new WebMediaPlayerService(options.audioPlayerComponent ?? AudioPlayer);
}

export function installMediaPlayer(app: App, options: MediaPlayerInstallOptions = {}): void {
    app.provide(MediaPlayerKey, createMediaPlayerService(options));
}

export { MediaPlayerKey } from "../token";
export type { MediaPlayerService, MediaPlayerState, NowPlayingInfo } from "../contract";
```

---

## 5) App registry

**`app/src/core/plugin-registry.ts`**:

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
export type { MediaPlayerService } from "@/plugins/media-player/contract";

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
import { appPluginsPlugin } from "@/core/plugin-registry";

// … after router, i18n, etc.
app.use(appPluginsPlugin);
```

---

## 7) Feature consumer

```vue
<script setup lang="ts">
import { inject } from "vue";
import { MediaPlayerKey } from "@/plugins/media-player/token";

const mediaPlayerService = inject(MediaPlayerKey);
if (!mediaPlayerService) throw new Error("MediaPlayerService not provided");
</script>
```

---

## 8) Adding another plugin (same pattern)

The media player is **one** `virtual:…` plugin. A second concern (e.g. **`downloads`**, **`notifications`**) repeats the same five steps — see **[Adding another build-swapped plugin](./README.md#adding-another-build-swapped-plugin)** in the architecture README for the full checklist and diagram.

Short version:

1. **`app/src/plugins/<name>/`** — `contract.ts`, `token.ts`, `web/index.ts` with `install…` + `provide`.
2. **`buildTargetVirtuals.ts`** — `resolveId("virtual:<name>")` → `plugins/<name>/${buildTarget}/index.ts`.
3. **`env.d.ts`** — `declare module "virtual:<name>" { … }`.
4. **`plugin-registry.ts`** — `import { install… } from "virtual:<name>"` and call it in `installPlugins`.
5. Components — `inject` using `@/plugins/<name>/token`.

Heavy native-only code can live in another package or repo and still be the body of a **`BUILD_TARGET`** implementation folder if you keep the **contract** stable in `luminary/app`.
