# Mango Query utilities

This folder contains two complementary utilities for working with Mango selectors in the client:

- mangoCompile: compile a Mango selector into an in‑memory predicate function
- mangoToDexie: execute a Mango query against a Dexie table with index pushdown when possible

Use the links below for the full docs:

- mangoCompile: ./mangoCompile.md
- mangoToDexie: ./mangoToDexie.md

## Quick overview

When to use which:

- Use mangoCompile when you already have data in memory and want to filter it with a familiar Mango shape.
- Use mangoToDexie when you want Dexie/IndexedDB to do part of the work via indexes, with any non‑indexable parts evaluated in memory.

Both utilities share the same selector shape (MangoSelector), covering equality, `$eq/$ne/$gt/$lt/$gte/$lte`, `$in`, and logical `$and/$or`.

## Cache persistence across page loads

Both utilities use **template-based caching** to avoid recompiling queries with the same structure. To eliminate cold-start latency on subsequent page loads, compiled templates are automatically persisted to `localStorage`. On app startup, call `warmMangoCaches()` to restore them before any queries run:

```ts
import { warmMangoCaches } from "./MangoQuery";

// Call once, early in app startup (before components mount)
warmMangoCaches();
```

- **First visit**: the persisted store is empty — this is a no-op. Templates are saved automatically as queries execute.
- **Subsequent visits**: persisted templates are loaded and pre-compiled so the first real queries hit a warm cache.
- **Graceful degradation**: if `localStorage` is unavailable (Web Workers, private browsing, Node.js), persistence is silently skipped.
