# Build-time plugins

This folder holds **implementations** of app services that depend on the build target (for example web vs native). Each subfolder is one plugin (e.g. `demo-banner`).

## How it fits together

- **`../contracts`** defines the stable surface: types, injection keys, and anything else components should import without pulling in platform code.
- **`virtual:*` modules** (see `vite-plugins/buildTargetVirtuals.ts`) point each build flavor at the right `index.ts` here. The app installs plugins through `../contracts/plugin-registry.ts`, which imports from `virtual:demo-banner` (not from this path directly), so swapping targets does not require changing application code.
- **Vue components and adapters** that belong to a plugin live next to that plugin’s service code.

## Conventions

- One directory per plugin; export `install*` helpers and re-export contract types/keys as needed from `index.ts`.
- Keep **platform-specific logic** inside the plugin. App and shared components should use **`inject(DemoBannerKey)`** (and other keys from contracts), not import web or native adapters directly unless unavoidable.

## Adding a plugin

1. Add types and an injection key under `../contracts/<name>/`.
2. Implement the service (and optional UI shell) in `./<name>/`.
3. Register `virtual:<name>` in `buildTargetVirtuals.ts` and call `install*` from `plugin-registry.ts`.

Full diagrams and bootstrap details: **[docs/vue-plugin-architecture/README.md](../../../../docs/vue-plugin-architecture/README.md)**.
