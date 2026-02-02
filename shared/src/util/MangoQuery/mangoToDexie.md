# mangoToDexie

Translate a Mango query into a Dexie `Collection`, pushing index‑friendly parts down to IndexedDB where possible and applying the rest in memory via `mangoCompile`.

Query analysis results (pushdown strategy and residual selector) are cached for repeated queries. Cached entries expire after 5 minutes of non-use.

> See also: [mangoCompile](./mangoCompile.md) for compiling a Mango selector into an in‑memory predicate.

## Signature

```ts
import type { Table } from "dexie";
import { mangoToDexie } from "./mangoToDexie";
import type { MangoQuery } from "./MangoTypes";

function mangoToDexie<T>(table: Table<T>, query: MangoQuery): Dexie.Collection<T>;
```

## Query shape (MangoQuery)

- `selector`: `MangoSelector` (same shape supported by `mangoCompile`)
- `$sort?`: array of sort objects; only the first entry is used. Example: `[ { createdAt: "asc" } ]` or `[ { createdAt: "desc" } ]`
- `$limit?`: number (max results)

Examples of `MangoSelector` are documented in [mangoCompile](./mangoCompile.md).

## How it works

The query is first normalized using `expandMangoSelector` to convert implicit AND conditions to explicit `$and` form. This simplifies the pushdown extraction logic.

### 1. Sort‑first path

- If `$sort` is provided, the function prefers `table.orderBy(field)` and uses `.reverse()` when the direction is `"desc"`.
- All filtering is then done in memory via `collection.filter(mangoCompile(selector))`.
- If `orderBy` throws (e.g., field not indexed), it falls back to `table.filter(() => true)` and still applies the in‑memory filter.

### 2. Pushdown without sort

If no `$sort`, the function extracts index‑friendly predicates and pushes them to Dexie using `where(...)`:

| Priority | Operator(s) | Dexie method | Notes |
|----------|-------------|--------------|-------|
| 1 | Multiple equalities | `where({ f1: v1, f2: v2, ... })` | Maximizes compound index usage. Booleans excluded. |
| 2 | `$beginsWith` | `where(field).startsWith(prefix)` | Efficient prefix search on indexed string field. |
| 3 | `$gte` + `$lte` (same field) | `where(field).between(lower, upper)` | Combined range query. Also handles `$gt`/`$lt` combinations. |
| 4 | `$in` | `where(field).anyOf(values)` | Array membership. Boolean‑only arrays excluded. |
| 5 | Single comparator | `equals`, `notEqual`, `above`, `below`, `aboveOrEqual`, `belowOrEqual` | For `$eq`, `$ne`, `$gt`, `$lt`, `$gte`, `$lte`. |

Any remaining conditions are compiled with `mangoCompile` and applied via `.filter(...)`.

### 3. In‑memory fallback

The following operators are **always** evaluated in memory via `mangoCompile`:

- **Logical**: `$or`, `$not`, `$nor`
- **Array membership**: `$nin` (no Dexie equivalent)
- **Array operators**: `$all`, `$elemMatch`, `$allMatch`, `$size`
- **Field/type operators**: `$exists`, `$type`, `$keyMapMatch`
- **Pattern matching**: `$regex` (Dexie's startsWith is used for `$beginsWith` only)
- **Numeric**: `$mod`

### 4. Limit

If `$limit` is set, `.limit($limit)` is applied to the resulting collection.

## Examples

### Multi‑equality pushdown (compound index friendly)

```ts
const q = {
    selector: { type: "book", authorId: 42, $and: [{ status: "published" }] },
    $limit: 25,
} satisfies MangoQuery;

const col = mangoToDexie(db.items, q);
const rows = await col.toArray();
// Pushes where({ type: "book", authorId: 42, status: "published" })
```

### `$beginsWith` pushdown (prefix search)

```ts
const q = {
    selector: { title: { $beginsWith: "The " }, score: { $gte: 80 } },
} satisfies MangoQuery;

const col = mangoToDexie(db.items, q);
const rows = await col.toArray();
// Pushes where("title").startsWith("The ") and applies score >= 80 in memory
```

### `between` pushdown (range query)

```ts
const q = {
    selector: { score: { $gte: 70, $lte: 90 } },
} satisfies MangoQuery;

const col = mangoToDexie(db.items, q);
const rows = await col.toArray();
// Pushes where("score").between(70, 90, true, true)
```

### `$in` pushdown with residual filtering

```ts
const q = {
    selector: { status: { $in: ["draft", "published"] }, score: { $gte: 80 } },
} satisfies MangoQuery;

const col = mangoToDexie(db.items, q);
const rows = await col.toArray();
// Pushes where("status").anyOf(["draft", "published"]) and applies score >= 80 in memory
```

### Single comparator pushdown

```ts
const q = { selector: { createdAt: { $gte: 1700000000000 } } } satisfies MangoQuery;
const rows = await mangoToDexie(db.items, q).toArray();
// Pushes where("createdAt").aboveOrEqual(...)
```

### Sort‑first path

```ts
const q = {
    selector: { type: "book" },
    $sort: [{ createdAt: "desc" }],
    $limit: 10,
} satisfies MangoQuery;
const rows = await mangoToDexie(db.items, q).toArray();
// Uses orderBy("createdAt").reverse(), then filters type === "book" in memory, then limit(10)
```

### Complex query with in‑memory operators

```ts
const q = {
    selector: {
        $or: [{ type: "post" }, { type: "comment" }],
        tags: { $all: ["featured", "published"] },
        score: { $exists: true },
    },
} satisfies MangoQuery;
const rows = await mangoToDexie(db.items, q).toArray();
// No pushdown possible, entire query evaluated in memory via mangoCompile
```

## Notes and limitations

- **Booleans** are not pushed down as equality criteria; they remain in the residual in‑memory filter.
- **`$or`, `$not`, `$nor`** are not pushed down; they're evaluated in memory.
- Only the **first `$sort` field** is honored. Additional sort keys are ignored.
- Pushing to `orderBy`/`where` requires Dexie indexes on the chosen fields. Dexie will warn at runtime if an index is missing.
- For `$in`, arrays consisting **only of booleans** are not pushed down.
- Residual construction removes only the pushed pieces (e.g., it strips `$in` if pushed but keeps other operators on the same field).
- **Dot notation** for nested fields is supported in the selector but typically won't be indexed in Dexie, so will fall back to in‑memory filtering.

## Return value

`mangoToDexie` returns a Dexie `Collection<T>`. Use standard Dexie methods on it:

- `.toArray()` to read results
- `.count()` to count
- `.offset(n)`, `.limit(m)` to page

## Cache management

Query analysis results are automatically cached to avoid recomputing pushdown strategies for repeated queries. The cache uses the same expiry mechanism as `mangoCompile` (5 minutes of non-use).

```ts
import { clearDexieCache, getDexieCacheStats } from "./mangoToDexie";

// Clear all cached analysis results
clearDexieCache();

// Get cache statistics
const stats = getDexieCacheStats();
console.log(`Analysis cache: ${stats.analysis.size} entries`);
console.log(`Expanded cache: ${stats.expanded.size} entries`);
```

## When to use

Use `mangoToDexie` when you're querying a Dexie `Table` and want:

- Automatic pushdown for common indexable predicates
- In‑memory correctness via the same `MangoSelector` semantics used by `mangoCompile`
- Optional sort/limit handling in one place
- Full Mango query syntax support (all operators work, some pushed down, rest in memory)
- Cached query analysis for repeated queries

> Back to overview: [README](./README.md)
