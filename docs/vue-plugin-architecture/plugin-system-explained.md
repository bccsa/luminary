# Build-time plugin system — detailed explainer (Luminar `app/`)

This document is a **presentation-ready** description of how **contract + virtual module + `provide` / `inject`** works in `luminar/app`. It complements the shorter **[README](./README.md)** and the **[starter-code walkthrough](./starter-code.md)**.

---

## 1. What you can say in 30 seconds

- We need **one stable API** (TypeScript interface + injection key) for things like the **global media player**, so UI code never imports `web/…` or `native/…` paths directly.
- **Vite** resolves a fake import id (`virtual:media-player`) to **one real file** under `src/plugins/media-player/{BUILD_TARGET}/` when we **build** the app.
- At **runtime**, a small **`install`** function **`provide`**s the implementation on the Vue app; components **`inject`** it using a key from **`token.ts`**.
- **Result:** swap implementation folders by changing **`BUILD_TARGET`** (or adding more `virtual:…` ids), not by editing every screen.

---

## 2. Problems this design solves

| Problem | How the pattern helps |
| --- | --- |
| UI coupled to “web” vs “future native JS” file paths | UI depends only on **`contract.ts`** + **`token.ts`**. |
| Shipping dead code for unused targets | Only the resolved **`…/{BUILD_TARGET}/index.ts`** tree is bundled. |
| Circular imports between the bundler graph and shared keys | **`token.ts`** does **not** import `virtual:…`; components import the key from there. |
| Bootstrap sprawl | **`plugin-registry.ts`** is one place that imports **`virtual:…`** modules and calls each **`install*`** |

---

## 3. Not the same as two other “plugins” in the app

You may hear “plugin” in three senses — only **A** is what this architecture doc is about:

| | Mechanism | Purpose |
| --- | --- | --- |
| **A. Build-swapped services (this doc)** | `virtual:…` + `BUILD_TARGET` + `plugin-registry.ts` | Injectable **services** (e.g. media player) with **one implementation per build**. |
| **B. Vue `app.use()`** | Standard Vue | Pinia, router, i18n, and our **`appPluginsPlugin`** wrapper. |
| **C. Extension plugins** | `VITE_PLUGINS` + `src/util/pluginLoader.ts` | Optional **external** TS classes copied in at build; **different** from `virtual:…`. See [`app/README.md`](../../../app/README.md). |

Auth and similar concerns are **outside** the `virtual:…` registry unless you deliberately move them there.

---

## 4. The five building blocks

1. **`contract.ts`** — TypeScript **interface** (and related types) for the service. Shared by all targets and by consumers for typing.

2. **`token.ts`** — **`InjectionKey<YourService>`** only. **No** import from `virtual:…`. UI imports this file to **`inject`**.

3. **Target implementation folder** — e.g. **`web/`** — classes that satisfy the contract (`WebMediaPlayerService`), plus **`web/index.ts`** that:
   - builds the service,
   - exports **`installMediaPlayer(app)`** which runs **`app.provide(MediaPlayerKey, service)`**,
   - re-exports types/keys as needed for **`plugin-registry`**.

4. **Virtual module id** — **`virtual:media-player`** — not a file on disk; **Vite** maps it to the correct **`index.ts`** at build time.

5. **`app/src/core/plugin-registry.ts`** — **Composition root** for `virtual:…` plugins: imports **`install*`** from **`virtual:…`** and calls them inside **`installPlugins(app)`**. **`main.ts`** does **`app.use(appPluginsPlugin)`** so registration happens once at startup.

---

## 5. What “virtual module” means (no magic in the browser)

- **`import { installMediaPlayer } from "virtual:media-player"`** is resolved **while Vite bundles**.
- The custom Vite plugin **`app/vite-plugins/buildTargetVirtuals.ts`** implements **`resolveId`**: when the id is **`virtual:media-player`**, it returns an **absolute path** to:

  `app/src/plugins/media-player/{BUILD_TARGET}/index.ts`

- The **browser** never sees `virtual:…` — it runs the bundled JavaScript like any other module.

Official background: [Vite — Virtual modules convention](https://vite.dev/guide/api-plugin.html#virtual-modules-convention).

---

## 6. `BUILD_TARGET`

- Read from env at **Vite config** time via **`loadEnv`** (see **`buildTargetVirtuals.ts`**). Default **`web`** if unset.
- **One** value typically applies to **every** `virtual:…` entry you add (e.g. all plugins use `…/web/` in the same build).
- **Per-plugin** env vars (e.g. different targets per plugin) are **optional** and only needed if one build must resolve **different** folder names for different plugins.

`BUILD_TARGET` is **not** a `VITE_*` variable exposed to the client by default; it drives **Node-side** resolution during the build.

---

## 7. Lifecycle: build time vs runtime

### Build time

1. Developer / CI sets **`BUILD_TARGET`** (or leaves default **`web`**).
2. Vite loads **`buildTargetVirtuals`** → sets internal **`buildTarget`**.
3. Any **`import "virtual:media-player"`** resolves to **`…/plugins/media-player/{buildTarget}/index.ts`**.
4. Rollup bundles **only** that implementation’s dependency graph.

### Runtime (browser or Capacitor WebView)

1. **`main.ts`** creates the app and, after other setup, runs **`app.use(appPluginsPlugin)`**.
2. **`appPluginsPlugin.install`** calls **`installPlugins(app)`** → **`installMediaPlayer(app)`** (from the **already bundled** module).
3. **`installMediaPlayer`** **`provide`**s **`MediaPlayerKey`** with a **`WebMediaPlayerService`** instance (for the web target).
4. **`App.vue`**, **`AudioPlayer.vue`**, etc. **`inject(MediaPlayerKey)`** and call methods on **`MediaPlayerService`** — they never import **`web/media-player.web.ts`** directly.

---

## 8. Example: global media player (today’s repo)

| Piece | Location / id |
| --- | --- |
| Virtual id | `virtual:media-player` |
| Vite resolver | `app/vite-plugins/buildTargetVirtuals.ts` |
| Contract | `app/src/plugins/media-player/contract.ts` |
| Token | `app/src/plugins/media-player/token.ts` |
| Web implementation | `app/src/plugins/media-player/web/media-player.web.ts` |
| Web entry (install + provide) | `app/src/plugins/media-player/web/index.ts` |
| TypeScript module declaration | `app/env.d.ts` → `declare module "virtual:media-player" { … }` |
| Registry | `app/src/core/plugin-registry.ts` |
| Bootstrap | `app/src/main.ts` → `app.use(appPluginsPlugin)` |
| UI shell | `App.vue` mounts **`getGlobalAudioPlayerComponent()`**; **`AudioPlayer.vue`** uses **`inject(MediaPlayerKey)`** |

---

## 9. Why `token.ts` is separate from `virtual:…`

- **`plugin-registry.ts`** must **`import`** from **`virtual:media-player`** to call **`install`**.
- If **`AudioPlayer.vue`** also imported **`virtual:media-player`** only to get the key, you could create awkward **module cycles** or pull the whole adapter graph into components.
- **`token.ts`** holds **only** **`MediaPlayerKey`** — a stable, tiny module — so UI **`import { MediaPlayerKey } from "@/plugins/media-player/token"`** stays clean.

---

## 10. Why `plugin-registry.ts` lives in `core/`, not inside `plugins/media-player/`

- **`plugins/media-player/`** is the **feature package** (contract + implementations).
- **`core/plugin-registry.ts`** is **application composition**: “which **`virtual:…`** plugins are enabled for this app and in what order.” That list may grow to **many** plugins; it should not live inside one feature folder.

---

## 11. Adding another `virtual:…` plugin (checklist)

1. Create **`app/src/plugins/<name>/`** with **`contract.ts`**, **`token.ts`**, and **`{BUILD_TARGET}/index.ts`** (e.g. **`web/index.ts`**) exporting **`install…(app)`** with **`provide`**.
2. Add **`resolveId`** branch in **`buildTargetVirtuals.ts`** for **`virtual:<name>`** → **`…/plugins/<name>/${buildTarget}/index.ts`**.
3. Add **`declare module "virtual:<name>"`** in **`env.d.ts`**.
4. **`import`** and call **`install…`** from **`plugin-registry.ts`** inside **`installPlugins`**.
5. In components, **`inject`** using **`@/plugins/<name>/token`**.

See **[Adding another build-swapped plugin](./README.md#adding-another-build-swapped-plugin)** in the README for prose and snippets.

---

## 12. Capacitor and a `native` or `capacitor` folder

- A folder like **`plugins/media-player/native/`** is still **TypeScript** for the **WebView**, not Swift/Kotlin.
- It is useful when the **JS** implementation should differ for the app build (e.g. Capacitor APIs) vs pure browser **`web/`**.
- You must run **`BUILD_TARGET=native`** (or whatever name you choose) for **that** Vite build so **`virtual:media-player`** resolves to **`native/index.ts`**.
- Capacitor **native** plugins (Xcode/Android) are installed separately; this pattern only swaps **which JS** is bundled.

---

## 13. Diagrams and further reading

- **Architecture (swimlanes):** [`vue-plugin-architecture.drawio`](./vue-plugin-architecture.drawio)
- **End-to-end flow (steps 1→5):** [`vue-plugin-architecture-flow.drawio`](./vue-plugin-architecture-flow.drawio)
- **App handbook:** [`app/README.md`](../../../app/README.md)
- **Code-heavy walkthrough:** [`starter-code.md`](./starter-code.md)

---

## 14. Possible Q&A

**Q: Do we need one env var per plugin?**  
**A:** Usually **no**. One **`BUILD_TARGET`** picks the same subfolder name under each plugin. Extra env vars only if you need **different** targets for **different** plugins in the **same** build.

**Q: Can we drop `virtual:…` and use normal imports?**  
**A:** Yes, but you lose a **single stable import id** and env-driven folder choice; you’d use direct paths or aliases instead.

**Q: Does Capacitor break this?**  
**A:** No. Capacitor serves **`dist/`**; whatever Vite built (for the chosen **`BUILD_TARGET`**) runs in the WebView.

---

*Document version: aligned with `luminar/app` layout and `virtual:media-player` as the reference implementation.*
