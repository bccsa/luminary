# Build-time plugin architecture (Luminary web app)

This document describes a **contract-driven** way to plug in behavior in the Vue app (`luminar/app`): **one TypeScript interface per concern**, **one implementation chosen when the bundle is built**, **`provide` / `inject`** for consumers, and **no feature code importing concrete adapter paths**.

**Related**

- **Presentation-style explainer** (build vs runtime, checklist, Q&A): [`plugin-system-explained.md`](./plugin-system-explained.md)
- App handbook (setup, extension plugins, env): [`app/README.md`](../../../app/README.md)
- Concrete file walkthrough using the repo's first plugin: [`starter-code.md`](./starter-code.md)
- Diagram sources (open in [diagrams.net](https://app.diagrams.net/) / draw.io; export SVG if needed):
  - **[`plugin-system-folders.drawio`](./plugin-system-folders.drawio)** — **folder tree** (`build-time-plugin-contracts/`, `build-time-plugins/`, `vite-plugins/`) with file-level annotations.
  - **[`vue-plugin-architecture.drawio`](./vue-plugin-architecture.drawio)** — components and swimlanes (build, bootstrap, provide/inject, checklist for a second plugin).
  - **[`vue-plugin-architecture-flow.drawio`](./vue-plugin-architecture-flow.drawio)** — **end-to-end flow** top to bottom: resolve → bundle → bootstrap → `provide` → `inject` (and how to repeat for another plugin).

---

## What we are optimizing for

- **Stable surface for UI** — Pages and components depend on an interface and an injection key, not on concrete implementation paths.
- **Small bundles** — Only the resolved implementation is bundled; unresolved code is not part of the graph.
- **Clear boundaries** — Contracts and tokens live in `build-time-plugin-contracts/<name>/`; implementations in `build-time-plugins/<name>/`; a single **registry** (`plugin-registry.ts`) composes what gets registered on the app.

**Not covered by this pattern:** ad-hoc **extension classes** loaded via `VITE_PLUGINS` / `VITE_PLUGIN_PATH` (see **Extension plugins** in [`app/README.md`](../../../app/README.md)).

---

## Core pieces (generic)

| Piece | Role |
| --- | --- |
| **Contract** | TypeScript types + service interface (`contract.ts`) in `build-time-plugin-contracts/<name>/`. |
| **Token** | `InjectionKey<YourService>` in `token.ts` (same folder as contract). Does **not** import the virtual module so UI can import the key without pulling in the adapter graph. |
| **Implementation** | Class(es) in `build-time-plugins/<name>/` (e.g. `<name>-web.ts`) that satisfy the contract. |
| **Virtual entry** | `build-time-plugins/<name>/index.ts`: `install…(app)`, `app.provide(YourKey, instance)`, re-exports. This is what Vite resolves. |
| **Vite** | A plugin maps `virtual:<name>` → `build-time-plugins/<plugin>/index.ts` via `resolveId`. |
| **Registry** | `src/build-time-plugin-contracts/plugin-registry.ts` imports `virtual:…` modules and exposes `app.use(appPluginsPlugin)` so bootstrap stays one place. |

### What `virtual:…` means

A **virtual module** is an **import id that does not point to a real file by itself** (for example `virtual:media-player`). At build time, the Vite plugin `app/vite-plugins/buildTargetVirtuals.ts` implements **`resolveId`**: when the bundler sees that id, it returns an **absolute path** to the actual entry file (`build-time-plugins/<name>/index.ts`). Application code always imports the **same** virtual id regardless of which implementation is wired up. See [Vite — Virtual Modules Convention](https://vite.dev/guide/api-plugin.html#virtual-modules-convention).

---

## Build time vs runtime

### Build time

Vite resolves each `virtual:<name>` import to the corresponding `build-time-plugins/<name>/index.ts`. Only that file tree is included in the bundle.

### Runtime

```mermaid
flowchart TB
    subgraph boot["Startup"]
        M["main.ts"]
        R["plugin-registry.ts"]
        V["virtual:… → resolved index.ts"]
        I["install…(app)"]
        P["app.provide(YourKey, service)"]
        M --> R
        R --> V
        V --> I
        I --> P
    end
    subgraph ui["Feature UI"]
        C["Components / composables"]
        INJ["inject(YourKey)"]
        C --> INJ
    end
    P --> INJ
```

**Typical steps**

1. **`main.ts`** uses **`app.use(appPluginsPlugin)`** from `@/build-time-plugin-contracts/plugin-registry`.
2. The registry imports **`virtual:…`** (not `build-time-plugins/...` directly).
3. The resolved module runs **`install…(app)`**, which constructs the service and **`provide`s** it on the app.
4. Feature code **`inject(YourKey)`** and calls only the contract. Import **`YourKey`** from **`token.ts`**, not from the registry, so components do not depend on the virtual module's dependency graph.

---

## Repository shape (conceptual)

```text
app/
  vite-plugins/
    buildTargetVirtuals.ts             # maps virtual:… → build-time-plugins/<name>/index.ts
  src/
    build-time-plugin-contracts/
      plugin-registry.ts               # imports virtual modules; appPluginsPlugin
      <plugin-name>/
        contract.ts
        token.ts
    build-time-plugins/
      <plugin-name>/
        index.ts                       # virtual module entry: install + provide
        <plugin-name>-web.ts           # implementation
```

See the [folder diagram (`plugin-system-folders.drawio`)](./plugin-system-folders.drawio) for the full visual tree.

---

## Adding another plugin

Each new capability gets its **own** `virtual:<name>` id and **parallel** entries in both `src/build-time-plugin-contracts/` and `src/build-time-plugins/`. The media player is not special — the same steps apply to plugin #2, #3, and so on. The diagram at [`vue-plugin-architecture.drawio`](./vue-plugin-architecture.drawio) includes a **checklist swimlane** for this.

1. **Scaffold contracts** — create **`app/src/build-time-plugin-contracts/<name>/`**:
   - **`contract.ts`** — interface + types for the service.
   - **`token.ts`** — `InjectionKey<…>` only (no import from `virtual:…`).

2. **Scaffold implementation** — create **`app/src/build-time-plugins/<name>/`**:
   - **`<name>-web.ts`** — class that satisfies the contract.
   - **`index.ts`** — `install<Name>(app)` that **`provide`**s the implementation under the key from `token.ts`, plus any re-exports the registry needs.

3. **Teach Vite the new id** — in **`app/vite-plugins/buildTargetVirtuals.ts`**, add another branch in **`resolveId`** (same pattern as `virtual:media-player`):

```ts
if (id === "virtual:downloads") {
    return `${root}/build-time-plugins/downloads/index.ts`;
}
```

4. **Type the virtual module** — in **`app/env.d.ts`**, add **`declare module "virtual:downloads"`** (or whatever id you chose) exporting **`install…`** and the injection key type, mirroring **`virtual:media-player`**.

5. **Wire bootstrap** — in **`app/src/build-time-plugin-contracts/plugin-registry.ts`**, **`import`** from **`virtual:downloads`**, call **`installDownloads(app)`** inside **`installPlugins`**, and re-export keys/types as needed.

6. **Use it in UI** — **`inject`** using the key imported from **`@/build-time-plugin-contracts/<name>/token`**, not from the virtual module.

**Order of `install*` calls** usually does not matter unless one plugin's `install` depends on another's `provide` being ready; keep dependencies explicit in **`installPlugins`**.

---

## Extension plugins (separate mechanism)

Optional class-based modules loaded by **`VITE_PLUGINS`** + **`VITE_PLUGIN_PATH`** are unrelated to **`virtual:…`**. See [`app/README.md`](../../../app/README.md).

---

## Testing

**`provide`** a mock implementation of the **contract** under the same **`InjectionKey`**. Mock the interface, not any concrete file under `build-time-plugins/`.

---

## Example: global media player

The media player is the reference implementation of this pattern in the repo.

| Concept | In this repo |
| --- | --- |
| Virtual module | `virtual:media-player` |
| Contract | `MediaPlayerService` in `app/src/build-time-plugin-contracts/media-player/contract.ts` |
| Token | `MediaPlayerKey` in `app/src/build-time-plugin-contracts/media-player/token.ts` |
| Registry | `app/src/build-time-plugin-contracts/plugin-registry.ts` |
| Implementation | `WebMediaPlayerService` in `build-time-plugins/media-player/media-player-web.ts`; entry `build-time-plugins/media-player/index.ts` |
| Consumers | e.g. `App.vue`, `AudioPlayer.vue` — **`inject(MediaPlayerKey)`**, key imported from **`token.ts`** |

Vite resolves **`virtual:media-player`** to **`app/src/build-time-plugins/media-player/index.ts`**. More detail and snippets: [`starter-code.md`](./starter-code.md).

---

## References

- [Vue — Plugins](https://vuejs.org/guide/reusability/plugins.html)
- [Vue — Provide / inject](https://vuejs.org/guide/components/provide-inject)
