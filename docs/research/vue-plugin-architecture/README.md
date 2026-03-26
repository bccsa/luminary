# Vue Plugin Architecture Research (Web + Capacitor)

## Why this research

This document summarizes best practices for building a **pluggable architecture in Vue** where feature implementations can be swapped by runtime/platform (for example Web vs Capacitor) without changing app-level feature code.

The target is a **general system** that can support media players, download managers, storage adapters, and future platform-specific modules.

## Core architectural goal

Define stable feature interfaces once, then register one concrete implementation per runtime:

- Web runtime uses browser-safe implementations.
- Capacitor runtime uses native-capable implementations.
- Feature consumers call the same injected API regardless of platform.

This gives one app codebase with isolated platform concerns.

## Research findings

### 1) Vue plugin + app-level dependency injection is the right foundation

Vue official docs support plugin installation with `app.use(plugin)` and app-level dependency injection with `app.provide(...)`.

Why this matters:

- Plugin install is the composition root for feature wiring.
- App-level provide/inject avoids prop drilling and hides platform branching from components.
- Vue recommends using global properties sparingly; `provide/inject` is cleaner for service APIs.

### 2) Use Symbol injection keys and typed interfaces

Vue recommends Symbol keys in larger apps to avoid collisions.  
For a plugin architecture, this should be treated as required, not optional.

Pattern:

- `tokens.ts`: export typed Symbol keys (e.g. `MediaPlayerKey`).
- `contracts.ts`: export interface contracts (e.g. `MediaPlayerService`).
- `plugins/runtime-services.ts`: detect runtime and provide concrete adapter.

### 3) Runtime detection should use Capacitor utilities, not user-agent logic

Capacitor provides:

- `Capacitor.isNativePlatform()` -> native app vs web/PWA
- `Capacitor.getPlatform()` -> `web | ios | android`
- `Capacitor.isPluginAvailable(name)` -> guard optional plugin usage

This is the recommended branch point for choosing implementations.

### 4) Component swapping can be done at service level first, UI level second

For most features, inject a service and keep one UI component.
Only when UI must differ by platform, use async component wrappers:

- Vue `defineAsyncComponent(() => import(...))` for lazy, split loading
- Keep import paths statically analyzable (or use `import.meta.glob` strategy)

This avoids making every feature a component switch.

### 5) Capacitor media/file handling has changed: use File Transfer for downloads

Capacitor docs indicate file download should use `@capacitor/file-transfer`, with filesystem URI support from `@capacitor/filesystem`.

Architecture implications:

- Keep download API behind your own service contract.
- Web adapter can use fetch + browser storage cache.
- Native adapter can use Filesystem + FileTransfer + offline index.

### 6) Native capabilities require explicit boundary APIs

Capabilities like background playback, device file access, and offline deletion should be treated as platform capability contracts:

- `PlaybackService`
- `DownloadService`
- `MediaStorageService`
- `OfflineCatalogService`

Each contract should define behavior, not implementation details.

## Recommended baseline architecture

```text
app/
  src/
    platform/
      contracts/
        media-player.ts
        downloads.ts
        storage.ts
      tokens.ts
      runtime.ts
      adapters/
        web/
          media-player.web.ts
          downloads.web.ts
          storage.web.ts
    plugins/
      platform-services.plugin.ts

luminary-deployment/
  luminary-plugins/
    capacitorNative.ts
    capacitorDeepLinks.ts
    capgoUpdater.ts
    auth.ts
    authBrowser.ts
```

### Why there is no `adapters/capacitor/` folder here

This project already has a dedicated runtime-integration layer in `luminary-deployment/luminary-plugins`.

That folder is the right home for **Capacitor-conditioned behavior**, which may include:

- true native plugin usage (Filesystem, FileTransfer, StatusBar, etc.)
- web JavaScript that only exists because the app is running inside Capacitor (e.g. in-app-browser auth flow, deep links)

So in `luminary` we keep the **contracts, tokens, and platform-agnostic feature code**, plus **pure web adapters**.
Capacitor-specific implementations are provided by the deployment plugins and wired in at install time.

### Runtime installer flow

1. App starts -> `app.use(platformServicesPlugin, options)`.
2. Plugin reads runtime (`isNativePlatform`, `getPlatform`).
3. Plugin builds adapter set:
   - web adapters from this repo
   - optional Capacitor runtime integrations from `luminary-deployment/luminary-plugins`
4. Plugin provides adapters through Symbol keys.
5. Feature modules inject contracts and run unchanged across platforms.

## Architecture pattern options (with trade-offs)

### Option A: Single runtime plugin (recommended default)

- One plugin decides adapters and provides all feature services.
- Best when you want centralized platform policy and simple bootstrapping.

Trade-off: one installer can become large; split by feature installer files.

### Option B: Feature-scoped plugins

- One plugin per feature (`playerPlugin`, `downloadPlugin`, etc).
- Better modularity and testing boundaries.

Trade-off: more install wiring and ordering to manage.

### Option C: Service registry/factory + plugin shell

- Plugin creates a registry and feature code resolves by token.
- Useful if you need dynamic replacement or enterprise extension points.

Trade-off: extra indirection and complexity; avoid unless you need runtime plugin extensions.

## Decision: selected architecture

**Selected option: A (Single runtime plugin).**

Why this fits this project:

- You need centralized runtime policy for Web vs Capacitor.
- Player and storage concerns are coupled and should be wired together consistently.
- One composition root keeps app bootstrap simple while preserving adapter boundaries.
- Feature-level complexity can still be controlled by splitting internal installer files.

### Option A implementation guardrails

- Keep a single exported plugin: `platformServicesPlugin`.
- Inside the plugin, split installation by feature:
  - `installMediaServices(app, runtime, sharedCore)`
  - `installDownloadServices(app, runtime, sharedCore)`
  - `installStorageServices(app, runtime, sharedCore)`
- Use a shared core library for cross-feature concerns (storage reads/writes, indexing, error mapping).
- Treat `luminary-deployment/luminary-plugins` as the **Capacitor runtime integration source**:
  - it may contain native plugin calls and/or Capacitor-conditioned web JS
  - it should expose install functions that can be composed into `platformServicesPlugin`
- Keep feature consumers fully platform-agnostic via tokens/contracts.

## Suggested contract design rules

- Keep contracts small and use-case driven.
- Return domain objects/events, not UI concerns.
- Expose capability flags where behavior differs (`supportsBackgroundPlayback`).
- Normalize errors into app-level error types.
- Include lifecycle methods where needed (`init`, `dispose`).

Example (TypeScript):

```ts
export interface MediaPlayerService {
  readonly supportsBackgroundPlayback: boolean;
  load(source: { id: string; url: string; kind: "audio" | "video" }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  onStateChange(cb: (state: PlayerState) => void): () => void;
}
```

## Capacitor-specific concerns to design for now

- Background media behavior differs by OS policy and plugin choice.
- File path handling in webview requires path conversion where needed.
- Downloads need resumability/error mapping and progress listeners.
- Offline file indexing and cleanup are app responsibilities.
- Native permissions and platform policy should be wrapped, not leaked.

## Feature matrix (Web vs Capacitor)

Legend:

- `Full`: expected first-class support
- `Partial`: supported with constraints or fallback behavior
- `No`: not available or not reliable for product use

| Feature | Web (Browser/PWA) | iOS (Capacitor) | Android (Capacitor) | Notes |
| --- | --- | --- | --- | --- |
| Contract-based service injection | Full | Full | Full | Same `provide/inject` contracts across platforms |
| Basic media playback (audio/video) | Full | Full | Full | Different adapter implementation, same app API |
| Background playback (screen off/app background) | Partial | Full | Full | Implement via `luminary-deployment/luminary-plugins` (Capacitor runtime integration); web depends on browser policy and is not guaranteed |
| Offline download to app-managed files | Partial | Full | Full | Implement via `luminary-deployment/luminary-plugins` using Filesystem + FileTransfer; web relies on browser storage strategy |
| Download progress events | Partial | Full | Full | Native progress comes from deployment plugins; web depends on transport/API support |
| Persistent downloaded media catalog | Partial | Full | Full | Native catalog/index stored via deployment plugins + app DB; web limited by storage model |
| Delete downloaded media files | Partial | Full | Full | Native deletion via deployment plugins (device app files); web depends on storage layer |
| Secure local storage boundary | Partial | Full | Full | Native secure storage boundary via deployment plugins/platform APIs; web is more limited |
| Plugin availability checks | No | Full | Full | Provided by Capacitor runtime; used inside deployment plugins (`Capacitor.isPluginAvailable(...)`) |
| Dynamic UI replacement per platform | Full | Full | Full | Via `defineAsyncComponent` or route/component factories |

### Mapping to existing `luminary-plugins`

Examples from `luminary-deployment/luminary-plugins`:

- `auth.ts`, `authBrowser.ts`: **web JS behavior** that exists because auth runs inside a Capacitor app (in-app browser / session behavior).
- `capacitorNative.ts`: Capacitor runtime integration (status bar, notch, fullscreen tweaks).
- `capgoUpdater.ts`: Capacitor update/runtime policy integration.
- `capacitorDeepLinks.ts`: Capacitor deep link routing integration.

### Recommended product framing

- Treat **Web** as capable for baseline playback and limited offline workflows.
- Treat **Capacitor iOS/Android** as the target for robust offline + background media experience.
- Keep one contract API and branch behavior behind capability flags in adapters.

## Incremental implementation plan

1. **Create platform contracts + tokens** for player/download/storage.
2. **Create shared core services** (storage/index helpers used by multiple feature installers).
3. **Implement web adapters first** to validate contract ergonomics.
4. **Create Capacitor adapters** with capability flags and guarded plugin checks.
5. **Install through one runtime plugin** with internal feature installers.
6. **Migrate consumer features** to only use injected contracts.
7. **Add contract tests** (shared test suite run against web + native adapters).
8. **Add observability** (adapter-level logs/metrics for runtime debugging).

## Decision checklist before implementation

- Which media player libs/SDKs per platform?
- Is background playback mandatory in v1?
- What is the offline storage quota/retention policy?
- Which download resume semantics are required?
- How will we test adapter parity (contract tests + smoke tests)?

## References

- Vue Plugins: <https://vuejs.org/guide/reusability/plugins.html>
- Vue Provide/Inject: <https://vuejs.org/guide/components/provide-inject>
- Vue Async Components: <https://vuejs.org/guide/components/async>
- Capacitor JavaScript Utilities: <https://capacitorjs.com/docs/basics/utilities>
- Capacitor Filesystem API: <https://capacitorjs.com/docs/apis/filesystem>
- Capacitor File Transfer API: <https://capacitorjs.com/docs/apis/file-transfer>

## Recommended next artifact

Capture this decision in an ADR:

- `docs/adr/XXXX-platform-service-plugin-architecture.md`

with selected option (A/B/C), contract boundaries, and migration plan.

## Companion implementation assets

- Editable architecture diagram: `docs/research/vue-plugin-architecture/vue-plugin-architecture.drawio`
- Starter TypeScript scaffolding: `docs/research/vue-plugin-architecture/starter-code.md`
