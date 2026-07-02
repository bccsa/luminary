# Vue Plugin Architecture — Demo Banner Walkthrough

This is the **minimal** build-time plugin in the repo. Use it to introduce the pattern in a meeting; follow with [`media-player-meeting.md`](./media-player-meeting.md) for the full real-world example.

---

## The key idea

> **A plugin exposes a Vue component through its contract.**
> The app renders that component without ever importing the file.

```ts
// App.vue — no import of DemoBanner.vue
const demoBannerService = inject(DemoBannerKey);
const BannerComponent = demoBannerService.getBannerComponent();

// Template:
// <component :is="BannerComponent" />
```

Swap the plugin implementation in `buildTargetVirtuals.ts` and the banner changes everywhere — `App.vue` stays the same.

---

## What the demo banner plugin does

Shows a dismissible banner at the top of the app to prove that:

1. Feature code depends on a **contract**, not a concrete file path.
2. Vite resolves **`virtual:demo-banner`** to one implementation at build time.
3. The plugin can **return a Vue component** the app renders dynamically.

---

## The five pieces

```
1. contract.ts         ← TypeScript interface (one method)
2. token.ts            ← Vue injection key
3. demo-banner-web.ts  ← Service implementation
4. index.ts            ← Install entry point (provide)
5. buildTargetVirtuals.ts ← Vite: "virtual:demo-banner" → index.ts
```

One Vue component completes the picture:

- **`DemoBanner.vue`** — the visible banner UI, returned by the service

---

## Walking through the files

### 1. Contract — what the plugin promises

```ts
// src/build-time/contracts/demo-banner/contract.ts

export type DemoBannerService = {
    getBannerComponent(): Component; // ← returns a Vue component; callers never import it directly
};
```

That is the entire surface the rest of the app depends on.

---

### 2. Token — the injection key

```ts
// src/build-time/contracts/demo-banner/token.ts

export const DemoBannerKey: InjectionKey<DemoBannerService> = Symbol("DemoBannerService");
```

Kept in a **separate file** so UI components can import the key without pulling the adapter dependency graph.

---

### 3. Service implementation

```ts
// src/build-time/plugins/demo-banner/demo-banner-web.ts

export class WebDemoBannerService implements DemoBannerService {
    constructor(private readonly bannerComponent: Component) {}

    getBannerComponent(): Component {
        return this.bannerComponent;
    }
}
```

No state, no DOM — just returns the component the installer passed in.

---

### 4. The Vue component

```vue
<!-- src/build-time/plugins/demo-banner/DemoBanner.vue -->
<template>
    <div v-if="visible" class="...">
        <p>This banner is rendered by the <strong>demo-banner</strong> build-time plugin …</p>
        <button @click="dismiss">×</button>
    </div>
</template>
```

Self-contained UI. The service never imports it — `index.ts` wires it in.

---

### 5. Install entry point

```ts
// src/build-time/plugins/demo-banner/index.ts

export function installDemoBanner(app: App, options = {}): void {
    app.provide(DemoBannerKey, createDemoBannerService(options));
}

export function createDemoBannerService(options = {}): DemoBannerService {
    return new WebDemoBannerService(options.bannerComponent ?? DemoBanner);
}
```

`options.bannerComponent` lets tests or alternate builds swap the UI shell.

---

### 6. Vite wiring

```ts
// vite-plugins/buildTargetVirtuals.ts
const virtualTargets: Record<string, string> = {
    "virtual:media-player": `${root}/build-time/plugins/media-player/index.ts`,
    "virtual:demo-banner":  `${root}/build-time/plugins/demo-banner/index.ts`,
};
```

Point `virtual:demo-banner` at a different folder to swap the entire implementation.

---

### 7. Registry

```ts
// src/build-time/contracts/plugin-registry.ts
import { installDemoBanner, DemoBannerKey } from "virtual:demo-banner";

export function installPlugins(app: App): void {
    installMediaPlayer(app);
    installDemoBanner(app);
}
```

`main.ts` calls `app.use(appPluginsManager)` once. All plugins are provided before mount.

---

### 8. Usage in App.vue

```ts
import { DemoBannerKey } from "@/build-time/contracts/demo-banner/token";
//                             ↑ token only — no import of DemoBanner.vue

const demoBannerService = inject(DemoBannerKey);
```

```html
<component :is="demoBannerService.getBannerComponent()" />
```

`App.vue` has **no import for `DemoBanner.vue`**.

---

## The full flow at a glance

```
build time
──────────────────────────────────────────────────────────────
Vite sees "virtual:demo-banner"
  → resolves to plugins/demo-banner/index.ts
  → bundles WebDemoBannerService + DemoBanner.vue

runtime — bootstrap
──────────────────────────────────────────────────────────────
main.ts  →  app.use(appPluginsManager)
         →  installDemoBanner(app)
         →  app.provide(DemoBannerKey, new WebDemoBannerService(DemoBanner))

runtime — mount
──────────────────────────────────────────────────────────────
App.vue  →  inject(DemoBannerKey)
         →  getBannerComponent()  →  DemoBanner.vue
         →  <component :is="DemoBanner" />
```

---

## Compare with media player

| | Demo banner | Media player |
| --- | --- | --- |
| Contract size | 1 method | ~15 methods + state types |
| State | None (component owns dismiss) | Service owns playback state |
| DOM bridge | None | `WebMediaAudioElement.vue` |
| Component exposure | `getBannerComponent()` | `getGlobalAudioPlayerComponent()` |
| Meeting role | Introduce the pattern | Show real-world complexity |

---

## Files for this plugin

| File | Role |
| --- | --- |
| `src/build-time/contracts/demo-banner/contract.ts` | Interface |
| `src/build-time/contracts/demo-banner/token.ts` | Injection key |
| `src/build-time/plugins/demo-banner/demo-banner-web.ts` | Service |
| `src/build-time/plugins/demo-banner/DemoBanner.vue` | Banner UI |
| `src/build-time/plugins/demo-banner/index.ts` | Install entry point |
| `vite-plugins/buildTargetVirtuals.ts` | Virtual module mapping |
| `env.d.ts` | TypeScript module declaration |
| `src/build-time/contracts/plugin-registry.ts` | Bootstrap composition |
| `src/App.vue` | Injects service, renders banner |

---

## Further reading

- Real-world complexity: [`media-player-meeting.md`](./media-player-meeting.md)
- Full architecture docs: [`README.md`](./README.md)
- Detailed explainer with Q&A: [`plugin-system-explained.md`](./plugin-system-explained.md)
