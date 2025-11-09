# mongoToDexie

Translate a Mongo‑like query into a Dexie `Collection`, pushing index‑friendly parts down to IndexedDB where possible and applying the rest in memory via `mongoCompile`.

> See also: [mongoCompile](./mongoCompile.md) for compiling a Mongo‑like selector into an in‑memory predicate.

## Signature

```ts
import type { Table } from "dexie";
import { mongoToDexie } from "./mongoToDexie";
import type { MQuery } from "./MongoTypes";

function mongoToDexie<T>(table: Table<T>, query: MQuery): Dexie.Collection<T>;
```

## Query shape (MQuery)

- `selector`: `MSelector` (same shape supported by `mongoCompile`)
- `$sort?`: array of sort objects; only the first entry is used. Example: `[ { createdAt: "asc" } ]` or `[ { createdAt: "desc" } ]`
- `$limit?`: number (max results)

Examples of `MSelector` are documented in [mongoCompile](./mongoCompile.md).

## How it works

1. Sort‑first path

- If `$sort` is provided, the function prefers `table.orderBy(field)` and uses `.reverse()` when the direction is `"desc"`.
- All filtering is then done in memory via `collection.filter(mongoCompile(selector))`.
- If `orderBy` throws (e.g., field not indexed), it falls back to `table.filter(() => true)` and still applies the in‑memory filter.

2. Pushdown without sort

- If no `$sort`, the function extracts an index‑friendly predicate from the selector and pushes it to Dexie using `where(...)`:
    - Combine as many field equalities as possible into a single `where({ f1: v1, f2: v2, ... })` (booleans are excluded since they’re typically not indexed).
    - Otherwise, prefer `$in` on one field → `where(field).anyOf(values)` (skips boolean‑only arrays).
    - Otherwise, push a single comparator on one field: `eq`, `ne`, `gt`, `lt`, `gte`, or `lte`.
- Any remaining conditions are compiled with `mongoCompile` and applied via `.filter(...)`.

3. Limit

- If `$limit` is set, `.limit($limit)` is applied to the resulting collection.

4. Fallback

- If nothing is pushdown‑friendly and there’s no `$sort`, everything is filtered in memory via `mongoCompile`.

## Examples

Multi‑equality pushdown (compound index friendly):

```ts
const q = {
    selector: { type: "book", authorId: 42, $and: [{ status: "published" }] },
    $limit: 25,
} satisfies MQuery;

const col = mongoToDexie(db.items, q);
const rows = await col.toArray();
// Pushes where({ type: "book", authorId: 42, status: "published" })
```

`$in` pushdown with residual filtering:

```ts
const q = {
    selector: { status: { $in: ["draft", "published"] }, score: { $gte: 80 } },
} satisfies MQuery;

const col = mongoToDexie(db.items, q);
const rows = await col.toArray();
// Pushes where("status").anyOf(["draft", "published"]) and applies score >= 80 in memory
```

Single comparator pushdown:

```ts
const q = { selector: { createdAt: { $gte: 1700000000000 } } } satisfies MQuery;
const rows = await mongoToDexie(db.items, q).toArray();
// Pushes where("createdAt").aboveOrEqual(...)
```

Sort‑first path:

```ts
const q = {
    selector: { type: "book" },
    $sort: [{ createdAt: "desc" }],
    $limit: 10,
} satisfies MQuery;
const rows = await mongoToDexie(db.items, q).toArray();
// Uses orderBy("createdAt").reverse(), then filters type === "book" in memory, then limit(10)
```

## Notes and limitations

- Booleans are not pushed down as equality criteria; they remain in the residual in‑memory filter.
- `$or` is not pushed down; it’s evaluated in memory by `mongoCompile`.
- Only the first `$sort` field is honored. Additional sort keys are ignored.
- Pushing to `orderBy`/`where` requires Dexie indexes on the chosen fields. Dexie will warn at runtime if an index is missing; for `orderBy`, this code also catches failures and falls back gracefully.
- For `$in`, arrays consisting only of booleans are not pushed down.
- Residual construction removes only the pushed pieces (e.g., it strips `$in` if pushed but keeps other operators on the same field).

## Return value

`mongoToDexie` returns a Dexie `Collection<T>`. Use standard Dexie methods on it:

- `.toArray()` to read results
- `.count()` to count
- `.offset(n)`, `.limit(m)` to page

## When to use

Use `mongoToDexie` when you’re querying a Dexie `Table` and want:

- Automatic pushdown for common indexable predicates
- In‑memory correctness via the same `MSelector` semantics used by `mongoCompile`
- Optional sort/limit handling in one place

> Back to overview: [README](./README.md)
