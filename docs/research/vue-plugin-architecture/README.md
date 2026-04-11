# Vue platform plugin architecture (Web + Capacitor)

This document describes how Luminary wires **platform-specific behavior** (browser vs Capacitor shell) using **Vue plugins**, **contracts**, and **`provide` / `inject`**, so feature code stays the same on every target.

**Companion files**

- Diagram (SVG): [`vue-plugin-architecture.drawio.svg`](./vue-plugin-architecture.drawio.svg)
- Starter scaffolding: [`starter-code.md`](./starter-code.md)

---

## What problem this solves

We want **one app codebase** where:

- **Web** uses safe, default implementations (DOM, fetch, etc.).
- **Capacitor** can use richer behavior (background audio, native plugins, in-app browser auth) **without** `if (isCapacitor)` scattered through pages and components.

The pattern: define a **small interface** once, register **one implementation per build**, and have features **inject** that API.

---

## How it works (end-to-end flow)

At startup, control flows in one direction: bootstrap → plugin → installer → `provide` → feature code. Native vs web only changes **which service instance** gets registered, not how features consume it.

### Flow (generic)

Every platform capability follows the same pipeline: one installer per concern, one injection token per contract, optional factory in plugin options for native/deployment.

```text
  main.ts
      │
      │  app.use(platformServicesPlugin [, options])
      ▼
  platformServicesPlugin.install
      │
      │  getRuntimeInfo() — optional context for installers
      ▼
  install…Services(app, runtime, options)
      │
      │  Resolve implementation:
      │    • options.create…Service?.(…)  ← override from deployment / native entry
      │    • else default web adapter      ← luminary default for that capability
      ▼
  app.provide(FeatureToken, service)
      │
      ▼
  Feature code — inject(FeatureToken) — same contract everywhere
```

### Example: media player

Today’s wiring uses the media contract, token, and installer names from the codebase.

```text
  main.ts
      │
      │  app.use(platformServicesPlugin [, options])
      ▼
  platformServicesPlugin.install
      │
      │  getRuntimeInfo()
      ▼
  installMediaServices(app, runtime, options)
      │
      │  service =
      │    options.createMediaPlayerService?.(audioPlayerComponent)
      │    ?? new WebMediaPlayerService(audioPlayerComponent)
      ▼
  app.provide(MediaPlayerKey, service)
      │
      ▼
  Feature code — inject(MediaPlayerKey) — MediaPlayerService
```

**Step-by-step (runtime)**

1. **`main.ts`** calls `app.use(platformServicesPlugin)` (and optional options).
2. **`platformServicesPlugin`** runs **`getRuntimeInfo()`** (e.g. `globalThis.Capacitor` in the shell) and forwards context to feature installers.
3. Each **installer** constructs a service that implements the right **contract**: default web implementation, or a factory passed on **`options`** for native bundles.
4. The installer **`app.provide(…Token, instance)`** for that capability.
5. Components and composables **`inject(…Token)`** and call the contract only—no direct Capacitor imports in feature code.
6. Where behavior differs, use **capability flags** on the service (e.g. `supportsBackgroundPlayback`) instead of `if (isNative)` in the UI.
7. **Capacitor-heavy code** stays in **`luminary-deployment/luminary-plugins`** (or similar); **luminary** stays free of **`@capacitor/core`** as a dependency.

**Build-time wiring (Capacitor bundle)**

The swap happens at the **Vue plugin** (`app.use` options), not by scattering platform checks in components:

- **Web:** `app.use(platformServicesPlugin)` — installers use built-in web defaults.
- **Native / deployment:** `app.use(platformServicesPlugin, { create…Service: … })` — factories come from deployment code that may import Capacitor.

**Media player today:** pass **`createMediaPlayerService`** when you need a non-web implementation; otherwise **`installMediaServices`** uses **`WebMediaPlayerService`**.

---

## Repository layout

```text
luminary/app/src/
  platform/
    contracts/          # TypeScript interfaces (e.g. media-player.ts)
    tokens.ts           # InjectionKey symbols
    runtime.ts          # getRuntimeInfo() without importing @capacitor/core
    adapters/
      web/              # Browser implementations
    installers/         # installXServices() that app.provide(...) tokens
  plugins/
    platform-services.plugin.ts   # app.use() entry; calls installers

luminary-deployment/
  luminary-plugins/     # Capacitor integrations, auth, updater, optional adapter factories
```

There is **no** `adapters/capacitor/` inside **luminary** by design: native coupling stays in **deployment**.

### “Where do I put things?” (quick map)

| You want to… | Put it here | Notes |
| --- | --- | --- |
| Define the public API for a platform capability | `app/src/platform/contracts/<feature>.ts` | Keep it small and stable; consumers only import the contract type (or inject token). |
| Create the injection token | `app/src/platform/tokens.ts` | `InjectionKey<T>` symbols live here. |
| Detect runtime (web vs native shell) | `app/src/platform/runtime.ts` | No `@capacitor/core` import; relies on `globalThis.Capacitor` if present. |
| Implement the **web** version | `app/src/platform/adapters/web/*.ts` | Browser-only code. |
| Register services with Vue `provide` | `app/src/platform/installers/*.installer.ts` | Example: `media-services.installer.ts` calls `app.provide(MediaPlayerKey, service)` using web defaults unless overridden via plugin options. |
| Wire installers into `app.use(...)` | `app/src/plugins/platform-services.plugin.ts` | Single “entry plugin” that runs installers. |
| Implement the **native/Capacitor** version | `luminary-deployment/luminary-plugins/**` | Deployment may import `@capacitor/*` and pass factories via plugin options. |

---

## Selected pattern: Option A (single runtime plugin)

- **One** exported plugin: `platformServicesPlugin`.
- **Several internal installers** under `app/src/platform/installers/`: `installMediaServices`, later `installDownloadServices`, etc.
- **`luminary-plugins`** remains the place for Capacitor-only or Capacitor-conditioned JS.

Other patterns (feature-scoped plugins, service registries) are documented as alternatives in research notes if you need to scale further.

---

## How to add a new platform service (“plugin”)

Use this checklist so new capabilities stay consistent with the media player precedent.

### 1. Define the contract

- Add **`app/src/platform/contracts/<feature>.ts`** with a focused interface (behavior + optional capability flags, no UI types).
- Prefer explicit methods and small types; add **`dispose`** / lifecycle only if needed.

### 2. Add an injection token

- Export **`export const MyFeatureKey: InjectionKey<MyFeatureService> = Symbol("MyFeatureService")`** in **`app/src/platform/tokens.ts`**.

### 3. Implement the web adapter

- Add **`app/src/platform/adapters/web/<feature>.web.ts`** (or under a small folder if multiple files).
- Implement the contract with browser APIs only.

### 4. Wire the default factory

Define the factory signature you want to allow deployment to override (e.g. `createMyFeatureService(...)`) and include it in the installer/plugin options type.

### 5. Register in the runtime plugin

- Add **`installMyFeatureServices(app, runtime, options?)`** under **`app/src/platform/installers/`**.
- Call it from **`platformServicesPlugin.install`** after **`getRuntimeInfo()`**.
- Inside the installer: **`app.provide(MyFeatureKey, createMyFeatureService(...))`**.

### 6. (Optional) Capacitor / deployment implementation

- Add a class under **`luminary-deployment/luminary-plugins/`** that implements the same contract (you may import **`@capacitor/core`** there).
- Export a factory with the **same signature** as the luminary default (e.g. `createMyFeatureService`).
- Pass that factory through **`app.use(platformServicesPlugin, { createMyFeatureService })`** (via plugin options). Pick one strategy per feature and document it in the installer comment.

### 7. Consume from features

- **`const svc = inject(MyFeatureKey)`**; throw or guard if missing (like `MediaPlayerKey`).
- **Do not** import Capacitor or branch on user-agent in pages/components.

### 8. Tests

- **Unit tests**: `provide` a mock implementation with **`global.provide`** / **`mount(..., { global: { provide: { [MyFeatureKey]: mock } } })`**.
- When ready: **contract tests** run the same scenarios against web and native adapters.

---

## Runtime detection (luminary)

**Luminary does not depend on `@capacitor/core`.**  
`getRuntimeInfo()` uses **`globalThis.Capacitor`** when the native shell injects it; pure browser builds see **web**.

For **optional** branches inside **deployment** plugins only, Capacitor’s documented helpers (`isNativePlatform()`, `getPlatform()`, `isPluginAvailable()`) are appropriate.

---

## Contract design rules (short)

- Small, use-case-driven interfaces.
- Capability flags where behavior differs (`supportsBackgroundPlayback`, etc.).
- Domain events / state—not widget props.
- Normalize errors at the adapter boundary when you cross that line in production.

---

## Feature matrix (summary)

| Capability | Web | Capacitor |
| --- | --- | --- |
| Same `inject` contracts | Yes | Yes |
| Media playback (same UI, different service) | Yes | Yes |
| Background / lock-screen media | Limited | Yes (OS + MediaSession + native config) |
| Heavy native APIs (filesystem, file transfer) | Limited | Yes (behind deployment adapters) |

---

## Mapping `luminary-plugins` (examples)

| File | Role |
| --- | --- |
| `auth.ts`, `authBrowser.ts` | Auth flows when running inside Capacitor WebView |
| `capacitorNative.ts` | Status bar, safe area, fullscreen helpers |
| `capgoUpdater.ts` | OTA update policy |
| `capacitorDeepLinks.ts` | Deep link routing |
| `capacitorMediaPlayer*.ts` (if present) | Native-oriented media factory / service |

---

## Research notes (optional depth)

- **Option B**: one plugin per feature—use if installers become too large.
- **Option C**: service registry—use only if you need dynamic third-party extensions.
- Downloads / storage: keep APIs behind contracts; Capacitor File Transfer + Filesystem belongs in deployment adapters (see Capacitor docs linked below).

---

## References

- [Vue – Plugins](https://vuejs.org/guide/reusability/plugins.html)
- [Vue – Provide / inject](https://vuejs.org/guide/components/provide-inject)
- [Capacitor – Utilities](https://capacitorjs.com/docs/basics/utilities)

---

## Next documentation step

Consider an ADR under `docs/adr/` referencing this research doc and the chosen Option A + repository split.
