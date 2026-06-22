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

Install from the sibling checkout with `--install-links` (a plain symlinked
install breaks Dexie reactivity):

```sh
npm install --install-links ../shared
```

After editing `shared/`, run `npm run build` here, then re-run the install
command in the consuming project so it picks up the new `dist/`.
