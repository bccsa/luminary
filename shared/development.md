# Development

Common commands for working on `luminary-shared`. See `CLAUDE.md` for the full
architecture reference.

## Build

```sh
npm run build      # vue-tsc + vite build → dist/
```

## Unit testing

```sh
npm run test       # vitest run (one-shot)
npm run test:watch # vitest watch mode (test:unit is an alias for the same)
```

Run a single test file: `npx vitest run src/path/to/file.spec.ts`
Run a single test by name: `npx vitest run -t "test name pattern"`

## Lint, format, type-check

```sh
npm run lint        # eslint
npm run lint:fix
npm run format      # prettier --write src/
npm run type-check  # vue-tsc --noEmit + vite build
```

## Using local changes in a consuming project

`vue` and `dexie` are peerDependencies — the consumer provides them so a single
instance is shared (two copies break Dexie/Vue reactivity). A consumer that
forces a single `vue`/`dexie` copy (bundler `dedupe`) can install from a sibling
checkout with a plain symlinked `npm install`. The recommended setup aliases
`luminary-shared` → `./src/index.ts` in the consumer's bundler, giving HMR of
library changes with no rebuild.

`npm run build` is still needed to refresh `dist/` for publishing and for the
consumer's TypeScript type resolution (`exports.types` → `dist/index.d.ts`), so a
type/signature change is picked up after a rebuild; behavioural changes hot-reload.
