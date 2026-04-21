# Vue Platform Plugin Starter Code

> **Note:** The Luminary app now uses **`virtual:media-player`**, **`BUILD_TARGET`**, and **`app/src/plugins/media-player/`** (see the [current architecture README](./README.md)). The **`platform/`** layout below is **illustrative** only and does not match the repository as of that migration.

This starter shows a minimal but production-oriented skeleton for platform adapters in Vue 3 + Capacitor.

Architecture choice applied here: **Option A (single runtime plugin)**, with **one folder per capability** under `platform/<feature>/` (contract, token, `web/`, `install.ts`) and a shared **`platform/core/`** for runtime detection. Hypothetical **downloads** below uses the same folder shape.

Repository boundary applied here:

- `luminary` defines **contracts + tokens + the runtime plugin shell** and includes **web-safe adapters**.
- `luminary-deployment/luminary-plugins` provides **Capacitor runtime integrations** (native plugin calls and/or Capacitor-conditioned web JS).

## 1) Contracts

Create `app/src/platform/media-player/contract.ts` (illustrative API — differs from the production `MediaPlayerService` in the app):

```ts
export type MediaKind = "audio" | "video";

export interface MediaSource {
  id: string;
  url: string;
  kind: MediaKind;
}

export interface PlayerState {
  status: "idle" | "loading" | "playing" | "paused" | "error";
  positionSeconds: number;
  durationSeconds: number;
  error?: string;
}

export interface MediaPlayerService {
  readonly supportsBackgroundPlayback: boolean;
  load(source: MediaSource): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  onStateChange(cb: (state: PlayerState) => void): () => void;
  dispose(): Promise<void>;
}
```

Create `app/src/platform/downloads/contract.ts`:

```ts
export interface DownloadRequest {
  id: string;
  url: string;
  fileName: string;
}

export interface DownloadProgress {
  id: string;
  bytes: number;
  totalBytes?: number;
}

export interface DownloadedItem {
  id: string;
  path: string;
  bytes: number;
  createdAt: string;
}

export interface DownloadService {
  readonly supportsBackgroundDownloads: boolean;
  enqueue(request: DownloadRequest): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<DownloadedItem[]>;
  onProgress(cb: (progress: DownloadProgress) => void): () => void;
}
```

## 2) Tokens

Create `app/src/platform/media-player/token.ts`:

```ts
import type { InjectionKey } from "vue";
import type { MediaPlayerService } from "./contract";

export const MediaPlayerKey: InjectionKey<MediaPlayerService> = Symbol("MediaPlayerService");
```

Create `app/src/platform/downloads/token.ts`:

```ts
import type { InjectionKey } from "vue";
import type { DownloadService } from "./contract";

export const DownloadServiceKey: InjectionKey<DownloadService> = Symbol("DownloadService");
```

## 3) Runtime detection helper

Create `app/src/platform/core/runtime.ts`.

The real luminary app **does not** import `@capacitor/core`; it uses `globalThis.Capacitor` when the shell injects it (see `app/src/platform/core/runtime.ts` in the repo). For a greenfield snippet you might write:

```ts
export type RuntimePlatform = "web" | "ios" | "android";

export interface RuntimeInfo {
  isNative: boolean;
  platform: RuntimePlatform;
}

export function getRuntimeInfo(): RuntimeInfo {
  const c = (globalThis as { Capacitor?: { isNativePlatform(): boolean; getPlatform(): string } }).Capacitor;
  if (!c) return { isNative: false, platform: "web" };
  return {
    isNative: c.isNativePlatform(),
    platform: c.getPlatform() as RuntimePlatform,
  };
}
```

## 3.1) Shared core (used by multiple feature installers)

Create `app/src/platform/shared/storage-core.ts` (shared cross-feature helpers stay outside `core/`):

```ts
export interface StoredDownloadMeta {
  id: string;
  path: string;
  bytes: number;
  createdAt: string;
}

export interface StorageCore {
  saveDownloadMeta(item: StoredDownloadMeta): Promise<void>;
  removeDownloadMeta(id: string): Promise<void>;
  listDownloadMeta(): Promise<StoredDownloadMeta[]>;
}

export class InMemoryStorageCore implements StorageCore {
  private items = new Map<string, StoredDownloadMeta>();

  async saveDownloadMeta(item: StoredDownloadMeta): Promise<void> {
    this.items.set(item.id, item);
  }

  async removeDownloadMeta(id: string): Promise<void> {
    this.items.delete(id);
  }

  async listDownloadMeta(): Promise<StoredDownloadMeta[]> {
    return [...this.items.values()];
  }
}
```

## 4) Web adapters (simple baseline)

Create `app/src/platform/media-player/web/media-player.web.ts`:

```ts
import type { MediaPlayerService, MediaSource, PlayerState } from "../contract";

export class WebMediaPlayerService implements MediaPlayerService {
  readonly supportsBackgroundPlayback = false;
  private listeners = new Set<(state: PlayerState) => void>();
  private state: PlayerState = { status: "idle", positionSeconds: 0, durationSeconds: 0 };

  async load(_source: MediaSource): Promise<void> {
    this.state = { ...this.state, status: "paused", positionSeconds: 0 };
    this.emit();
  }

  async play(): Promise<void> {
    this.state = { ...this.state, status: "playing" };
    this.emit();
  }

  async pause(): Promise<void> {
    this.state = { ...this.state, status: "paused" };
    this.emit();
  }

  async seek(seconds: number): Promise<void> {
    this.state = { ...this.state, positionSeconds: seconds };
    this.emit();
  }

  onStateChange(cb: (state: PlayerState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  async dispose(): Promise<void> {
    this.listeners.clear();
  }

  private emit(): void {
    this.listeners.forEach((cb) => cb(this.state));
  }
}
```

## 5) Capacitor runtime adapters (deployment plugins)

In `luminary`, prefer not to add a local `adapters/capacitor/*` folder if you already have `luminary-deployment/luminary-plugins`.

The Capacitor implementation should live in the deployment plugins repo (or be published from there as a package), and then be composed into `platformServicesPlugin` during installation.

Below is still a valid example of what the Capacitor download adapter looks like — place it under:

- `luminary-deployment/luminary-plugins/downloads.cap.ts` (or similar)

Adjust the type import paths to your monorepo (they should resolve to luminary’s **`app/src/platform/downloads/contract.ts`** and **`app/src/platform/shared/storage-core.ts`** when using the folder layout above).

```ts
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { FileTransfer } from "@capacitor/file-transfer";
import type { DownloadService, DownloadProgress, DownloadRequest, DownloadedItem } from "../../contracts/downloads";
import type { StorageCore } from "../../shared/storage-core";

export class CapacitorDownloadService implements DownloadService {
  readonly supportsBackgroundDownloads = true;
  private listeners = new Set<(p: DownloadProgress) => void>();
  constructor(private readonly storageCore: StorageCore) {
    if (!Capacitor.isPluginAvailable("FileTransfer")) {
      throw new Error("FileTransfer plugin not available on this platform");
    }
  }

  async enqueue(request: DownloadRequest): Promise<void> {
    const fileInfo = await Filesystem.getUri({
      directory: Directory.Data,
      path: `downloads/${request.fileName}`,
    });

    const progressListener = await FileTransfer.addListener("progress", (progress) => {
      this.emit({
        id: request.id,
        bytes: progress.bytes,
        totalBytes: progress.lengthComputable ? progress.contentLength : undefined,
      });
    });

    try {
      await FileTransfer.downloadFile({
        url: request.url,
        path: fileInfo.uri,
        progress: true,
      });

      await this.storageCore.saveDownloadMeta({
        id: request.id,
        path: fileInfo.uri,
        bytes: 0,
        createdAt: new Date().toISOString(),
      });
    } finally {
      await progressListener.remove();
    }
  }

  async remove(id: string): Promise<void> {
    const item = (await this.storageCore.listDownloadMeta()).find((x) => x.id === id);
    if (!item) return;
    await Filesystem.deleteFile({ path: item.path });
    await this.storageCore.removeDownloadMeta(id);
  }

  async list(): Promise<DownloadedItem[]> {
    return await this.storageCore.listDownloadMeta();
  }

  onProgress(cb: (progress: DownloadProgress) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(progress: DownloadProgress): void {
    this.listeners.forEach((cb) => cb(progress));
  }
}
```

## 6) Installer plugin (Option A composition root)

Create `app/src/plugins/platform-services.plugin.ts` (in `luminary`):

```ts
import type { App } from "vue";
import { getRuntimeInfo } from "../platform/core/runtime";
import { MediaPlayerKey, WebMediaPlayerService } from "../platform/media-player";
import { DownloadServiceKey } from "../platform/downloads/token";
import type { DownloadService } from "../platform/downloads/contract";
import { InMemoryStorageCore } from "../platform/shared/storage-core";
// Example: runtime integration installers imported from deployment plugins (or a published package)
// import { installCapacitorDownloads } from "luminary-plugins/capacitorDownloads";

class WebDownloadService implements DownloadService {
  readonly supportsBackgroundDownloads = false;
  async enqueue(): Promise<void> {}
  async remove(): Promise<void> {}
  async list() {
    return [];
  }
  onProgress() {
    return () => {};
  }
}

export const platformServicesPlugin = {
  install(app: App): void {
    const runtime = getRuntimeInfo();
    const sharedCore = new InMemoryStorageCore();

    // Option A: one plugin, internal feature installers.
    installMediaServices(app, runtime);
    installDownloadServices(app, runtime, sharedCore);

    // Optional: compose Capacitor runtime integrations here (deployment plugins).
    // if (runtime.isNative) installCapacitorDownloads(app, runtime, sharedCore);
  },
};

function installMediaServices(app: App, _runtime: ReturnType<typeof getRuntimeInfo>): void {
  const mediaPlayer = new WebMediaPlayerService();
  app.provide(MediaPlayerKey, mediaPlayer);
}

function installDownloadServices(
  app: App,
  runtime: ReturnType<typeof getRuntimeInfo>,
  sharedCore: InMemoryStorageCore,
): void {
  // In luminary (web app), default to web adapter.
  // In Capacitor builds, a deployment plugin should override/provide the native download service.
  const downloadService = new WebDownloadService();
  app.provide(DownloadServiceKey, downloadService);
}
```

## 7) Consumer usage pattern

Use contracts in feature code, with no platform branching:

```ts
import { inject } from "vue";
import { MediaPlayerKey } from "@/platform/media-player";

const player = inject(MediaPlayerKey);
if (!player) throw new Error("MediaPlayerService not provided");

await player.load({ id: "ep-1", kind: "audio", url: "https://..." });
await player.play();
```

## Notes before production

- Add persistent metadata storage for downloads (SQLite/Dexie/etc).
- Normalize adapter errors into a shared app error type.
- Add contract tests that run the same behavior checks for web/native adapters.
- Introduce separate native webview player and native OS-level player if needed.
