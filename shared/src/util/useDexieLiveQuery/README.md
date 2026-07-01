# useDexieLiveQuery

## Overview

A Vue 3 wrapper around [Dexie](https://dexie.org)'s `liveQuery` that turns a
Dexie query into a reactive `Ref`. The query re-runs automatically whenever the
underlying IndexedDB data changes — including across browser tabs — so the
returned ref always reflects the current database state.

This is the primitive for reading reactively from IndexedDB. (The former
`db.toRef` / `db.getAsRef` / `db.whereTypeAsRef` / … ref-returning helpers on the
`Database` class — which wrapped `liveQuery` via `@vueuse/rxjs` — have been
removed; use `useHybridQuery` for `db.docs` reads and `useDexieLiveQuery` for
other tables.)

> Adapted from the upstream
> [`useDexieLiveQuery`](https://github.com/devweissmikhail/useDexieLiveQuery)
> project — see [origin.md](origin.md).

## Peer dependencies

```sh
npm install dexie
```

## Usage

```typescript
import { useDexieLiveQuery } from "luminary-shared";

const allTodos = useDexieLiveQuery(() => db.todos.toArray(), { initialValue: [] });

// Track a "loaded" status alongside the data

const { todos, loaded } = useDexieLiveQuery(
    () => db.todos.toArray().then((todos) => ({ todos, loaded: true })),
    { initialValue: { todos: [], loaded: false } },
);
```

### With dependencies

Use `useDexieLiveQueryWithDeps` when the query depends on reactive sources: it
re-subscribes whenever a dependency changes (similar to Vue's
[`watch`](https://vuejs.org/api/reactivity-core.html#watch), but you return the
Dexie query from the callback).

```typescript
import { useDexieLiveQuery, useDexieLiveQueryWithDeps } from "luminary-shared";
import { ref } from "vue";

const activeListId = useDexieLiveQuery(() =>
    db.keyval.get("activeListId").then((res) => res?.value),
);

const sortedTodos = useDexieLiveQueryWithDeps(
    activeListId,
    (activeListId: string | undefined) =>
        db.todos.where("listId").equals(activeListId).toArray(),
    {
        initialValue: [],
        /* Supports all watch options; default: immediate: true */
    },
);

// Multiple deps

const offset = ref<number>(15);
const limit = ref<number>(15);

const limitedTodos = useDexieLiveQueryWithDeps(
    [offset, limit],
    ([offset, limit]: [number, number]) => db.todos.offset(offset).limit(limit).toArray(),
    { initialValue: [] },
);
```

## Caveats

- **Setup-only auto-cleanup.** Call inside a component `setup` / `<script setup>`
  so the subscription is torn down on unmount. Outside an effect scope it won't
  auto-dispose — a dev-console warning fires, but the subscription still leaks
  forever; never call this from a plain function invoked repeatedly (e.g.
  per-row/per-render helpers, or a `computed` getter re-evaluated outside the
  original scope), since each call leaks one more permanently-live subscription.
- **Editable variant.** `useDexieLiveQueryAsEditable` wraps the result with
  [`toEditable`](../toEditable/README.md) so the UI can edit a copy and diff against the
  source. It is **deprecated** — prefer `useDexieLiveQuery` + `toEditable`
  explicitly, or [`useHybridQuery`](../HybridQuery/README.md) for local-first reads.
