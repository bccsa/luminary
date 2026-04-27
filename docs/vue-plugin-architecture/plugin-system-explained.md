# Build-time plugin system — detailed explainer (Luminar `app/`)

This document is a **presentation-ready** description of how **contract + virtual module + `provide` / `inject`** works in `luminar/app`. It complements the shorter **[README](./README.md)** and the **[starter-code walkthrough](./starter-code.md)**.

---

## 1. What you can say in 30 seconds

- We need **one stable API** (TypeScript interface + injection key) for things like the **global media player**, so UI code never imports concrete implementation paths directly.
- **Vite** resolves a fake import id (`virtual:media-player`) to **one real file** under `src/build-time-plugins/media-player/` when we **build** the app.
- At **runtime**, a small **`install`** function **`provide`**s the implementation on the Vue app; components **`inject`** it using a key from **`token.ts`**.
- **Result:** add or change implementations by editing `build-time-plugins/` and `buildTargetVirtuals.ts`, not by editing every screen.

---

## 2. Problems this design solves

| Problem | How the pattern helps |
| --- | --- |
| UI coupled to concrete implementation paths | UI depends only on **`contract.ts`** + **`token.ts`**. |
| Circular imports between the bundler graph and shared keys | **`token.ts`** does **not** import `virtual:…`; components import the key from there. |
| Bootstrap sprawl | **`plugin-registry.ts`** is one place that imports **`virtual:…`** modules and calls each **`install*`** |

---

## 3. Not the same as two other "plugins" in the app

You may hear "plugin" in three senses — only **A** is what this architecture doc is about:

| | Mechanism | Purpose |
| --- | --- | --- |
| **A. Build-time services (this doc)** | `virtual:…` + `plugin-registry.ts` | Injectable **services** (e.g. media player) resolved at build time. |
| **B. Vue `app.use()`** | Standard Vue | Pinia, router, i18n, and our **`appPluginsPlugin`** wrapper. |
| **C. Extension plugins** | `VITE_PLUGINS` + `src/util/pluginLoader.ts` | Optional **external** TS classes copied in at build; **different** from `virtual:…`. See [`app/README.md`](../../../app/README.md). |

Auth and similar concerns are **outside** the `virtual:…` registry unless you deliberately move them there.

---

## 4. The five building blocks

1. **`contract.ts`** — TypeScript **interface** (and related types) for the service. Lives in **`src/build-time-plugin-contracts/<name>/`**. Shared by all implementations and by consumers for typing.

2. **`token.ts`** — **`InjectionKey<YourService>`** only. **No** import from `virtual:…`. Lives alongside `contract.ts` in **`src/build-time-plugin-contracts/<name>/`**. UI imports this file to **`inject`**.

3. **Implementation folder** — **`src/build-time-plugins/<name>/`** — classes that satisfy the contract (e.g. `<name>-web.ts`), plus **`index.ts`** that:
   - builds the service,
   - exports **`install<Name>(app)`** which runs **`app.provide(<Name>Key, service)`**,
   - re-exports types/keys as needed for **`plugin-registry`**.

4. **Virtual module id** — **`virtual:media-player`** — not a file on disk; **Vite** maps it to **`src/build-time-plugins/<name>/index.ts`** at build time.

5. **`src/build-time-plugin-contracts/plugin-registry.ts`** — **Composition root** for `virtual:…` plugins: imports **`install*`** from **`virtual:…`** and calls them inside **`installPlugins(app)`**. **`main.ts`** does **`app.use(appPluginsPlugin)`** so registration happens once at startup.

---

## 5. What "virtual module" means (no magic in the browser)

- **`import { installMediaPlayer } from "virtual:media-player"`** is resolved **while Vite bundles**.
- The custom Vite plugin **`app/vite-plugins/buildTargetVirtuals.ts`** implements **`resolveId`**: when the id is **`virtual:media-player`**, it returns an **absolute path** to:

  `app/src/build-time-plugins/media-player/index.ts`

- The **browser** never sees `virtual:…` — it runs the bundled JavaScript like any other module.

Official background: [Vite — Virtual modules convention](https://vite.dev/guide/api-plugin.html#virtual-modules-convention).

---

## 6. Lifecycle: build time vs runtime

### Build time

1. Vite loads **`buildTargetVirtuals`**.
2. Any **`import "virtual:media-player"`** resolves to **`src/build-time-plugins/media-player/index.ts`**.
3. Rollup bundles **only** that implementation's dependency graph.

### Runtime

1. **`main.ts`** creates the app and, after other setup, runs **`app.use(appPluginsPlugin)`**.
2. **`appPluginsPlugin.install`** calls **`installPlugins(app)`** → **`installMediaPlayer(app)`** (from the **already bundled** module).
3. **`installMediaPlayer`** **`provide`**s **`MediaPlayerKey`** with a **`WebMediaPlayerService`** instance.
4. **`App.vue`**, **`AudioPlayer.vue`**, etc. **`inject(MediaPlayerKey)`** and call methods on **`MediaPlayerService`** — they never import **`media-player-web.ts`** directly.

---

## 7. Example: global media player

| Piece | Location / id |
| --- | --- |
| Virtual id | `virtual:media-player` |
| Vite resolver | `app/vite-plugins/buildTargetVirtuals.ts` |
| Contract | `app/src/build-time-plugin-contracts/media-player/contract.ts` |
| Token | `app/src/build-time-plugin-contracts/media-player/token.ts` |
| Implementation | `app/src/build-time-plugins/media-player/media-player-web.ts` |
| Entry (install + provide) | `app/src/build-time-plugins/media-player/index.ts` |
| TypeScript module declaration | `app/env.d.ts` → `declare module "virtual:media-player" { … }` |
| Registry | `app/src/build-time-plugin-contracts/plugin-registry.ts` |
| Bootstrap | `app/src/main.ts` → `app.use(appPluginsPlugin)` |
| UI shell | `App.vue` mounts **`getGlobalAudioPlayerComponent()`**; **`AudioPlayer.vue`** uses **`inject(MediaPlayerKey)`** |

---

## 8. Why `token.ts` is separate from `virtual:…`

- **`plugin-registry.ts`** must **`import`** from **`virtual:media-player`** to call **`install`**.
- If **`AudioPlayer.vue`** also imported **`virtual:media-player`** only to get the key, you could create awkward **module cycles** or pull the whole adapter graph into components.
- **`token.ts`** holds **only** **`MediaPlayerKey`** — a stable, tiny module — so UI **`import { MediaPlayerKey } from "@/build-time-plugin-contracts/media-player/token"`** stays clean.

---

## 9. Why `plugin-registry.ts` lives in `build-time-plugin-contracts/`, not inside `build-time-plugins/`

- **`build-time-plugins/<name>/`** is the **implementation package** (concrete adapter + installer).
- **`build-time-plugin-contracts/plugin-registry.ts`** is **application composition**: "which **`virtual:…`** plugins are enabled for this app and in what order." Placing it next to the contracts (interfaces and tokens) rather than inside any single plugin folder keeps it neutral as the list grows to many plugins.
- Consumers that only need a key import from **`build-time-plugin-contracts/<name>/token.ts`** — they never need to touch the registry or the implementations.

---

## 10. Adding another `virtual:…` plugin (checklist)

1. Create **`app/src/build-time-plugin-contracts/<name>/`** with **`contract.ts`** and **`token.ts`**.
2. Create **`app/src/build-time-plugins/<name>/`** with **`<name>-web.ts`** (implementation) and **`index.ts`** (exporting **`install…(app)`** with **`provide`**).
3. Add **`resolveId`** branch in **`buildTargetVirtuals.ts`** for **`virtual:<name>`** → **`…/build-time-plugins/<name>/index.ts`**.
4. Add **`declare module "virtual:<name>"`** in **`env.d.ts`**.
5. **`import`** and call **`install…`** from **`plugin-registry.ts`** inside **`installPlugins`**.
6. In components, **`inject`** using **`@/build-time-plugin-contracts/<name>/token`**.

See **[Adding another plugin](./README.md#adding-another-plugin)** in the README for prose and snippets.

---

## 11. Diagrams and further reading

- **Folder tree (file-level):** [`plugin-system-folders.drawio`](./plugin-system-folders.drawio)
- **Architecture (swimlanes):** [`vue-plugin-architecture.drawio`](./vue-plugin-architecture.drawio)
- **End-to-end flow (steps 1→5):** [`vue-plugin-architecture-flow.drawio`](./vue-plugin-architecture-flow.drawio)
- **App handbook:** [`app/README.md`](../../../app/README.md)
- **Code-heavy walkthrough:** [`starter-code.md`](./starter-code.md)

---

## 12. Possible Q&A

**Q: Can we drop `virtual:…` and use normal imports?**  
**A:** Yes, but you lose a **single stable import id** and the ability to wire different implementations without touching feature code; you'd use direct paths or aliases instead.

**Q: Can we have multiple implementations for the same plugin?**  
**A:** Yes. Add a second implementation file in `build-time-plugins/<name>/` and update `buildTargetVirtuals.ts` to resolve to it based on any condition you need (env var, flag, etc.).

---

*Document version: aligned with `luminar/app` layout and `virtual:media-player` as the reference implementation.*
