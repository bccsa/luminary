# mangoToDexie

Translate a Mango query into a Dexie `Collection`, pushing index‑friendly parts down to IndexedDB where possible and applying the rest in memory via `mangoCompile`.

**Template-based caching**: Query analysis results are cached based on query *structure*, not values. This means queries like `{ type: "post" }` and `{ type: "page" }` share the same cached analysis, with values applied at runtime. Cache entries expire after 5 minutes of non-use.

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

The query selector is first normalized into a **template** (structure with placeholders) and **values** (extracted parameters). This enables template-based caching where the analysis is done once per structure.

### 1. Sort‑first path

- If `$sort` is provided, the function prefers `table.orderBy(field)` and uses `.reverse()` when the direction is `"desc"`.
- All filtering is then done in memory via `collection.filter(mangoCompile(selector))`.
- If `orderBy` throws (e.g., field not indexed), it falls back to `table.filter(() => true)` and still applies the in‑memory filter.

### 2. Pushdown without sort (template-based)

If no `$sort`, the function uses cached template analysis:

1. **Normalize**: Extract values from selector, creating a template
2. **Analyze**: Get or compute pushdown strategy for the template (cached)
3. **Apply**: Execute pushdown with actual runtime values

| Priority | Operator(s) | Dexie method | Notes |
|----------|-------------|--------------|-------|
| 1 | Multiple equalities | `where({ f1: v1, f2: v2, ... })` | Maximizes compound index usage. Booleans excluded. |
| 2 | `$beginsWith` | `where(field).startsWith(prefix)` | Efficient prefix search on indexed string field. |
| 3 | `$gte` + `$lte` (same field) | `where(field).between(lower, upper)` | Combined range query. Also handles `$gt`/`$lt` combinations. |
| 4 | `$in` | `where(field).anyOf(values)` | Array membership. Boolean‑only arrays excluded. |
| 4a | `$in` on primary key | `table.bulkGet(values)` | Direct key lookups, faster than `anyOf` for primary key fields. |
| 5 | Single comparator | `equals`, `notEqual`, `above`, `below`, `aboveOrEqual`, `belowOrEqual` | For `$eq`, `$ne`, `$gt`, `$lt`, `$gte`, `$lte`. |

The pushdown strategy is cached per template. At runtime, the cached strategy is applied with actual values:

```ts
// Template analysis (cached): { type: $0, authorId: $1 } → multiEq pushdown
// Runtime application: where({ type: "post", authorId: 42 })
```

Any remaining conditions are compiled into a parameterized residual predicate and applied via `.filter(...)`.

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

### `$in` on primary key (bulkGet optimization)

```ts
const q = {
    selector: { _id: { $in: ["doc1", "doc2", "doc3"] } },
} satisfies MangoQuery;

const rows = await mangoToDexie(db.docs, q);
// Uses table.bulkGet(["doc1", "doc2", "doc3"]) for direct key lookups
// Automatically detected when $in targets the table's primary key (table.schema.primKey.keyPath)
```

This also works with residual filters, sort, and limit:

```ts
const q = {
    selector: { _id: { $in: ids }, status: "published" },
    $sort: [{ createdAt: "desc" }],
    $limit: 10,
} satisfies MangoQuery;

const rows = await mangoToDexie(db.docs, q);
// bulkGet fetches by primary key, then status filter + sort + limit applied in memory
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
- **`$in` on primary key** is automatically optimized to use `table.bulkGet()` for direct key lookups instead of `where(pk).anyOf()`. This is detected at runtime by comparing the `$in` field against `table.schema.primKey.keyPath`. Sort and limit are applied in-memory on the (typically small) result set. Only simple string primary keys are supported (not compound or out-of-line keys).
- **Dot notation** for nested fields is supported in the selector but typically won't be indexed in Dexie, so will fall back to in‑memory filtering.
- **Unsupported operators** (e.g., `$contains`) will log a warning to the console and cause that condition to return `false`. See [mangoCompile](./mangoCompile.md#debugging-unsupported-operators) for details.

## Return value

`mangoToDexie` returns a Dexie `Collection<T>`. Use standard Dexie methods on it:

- `.toArray()` to read results
- `.count()` to count
- `.offset(n)`, `.limit(m)` to page

## Cache management

Query analysis results are automatically cached using **template-based caching**. This means:

- The query structure is normalized (values replaced with placeholders)
- The pushdown strategy and residual predicate are cached per template
- Different values with the same structure share the cached analysis

```ts
import { clearDexieCache, getDexieCacheStats } from "./mangoToDexie";

// Clear all cached analysis results
clearDexieCache();

// Get cache statistics
const stats = getDexieCacheStats();
console.log(`Cache size: ${stats.size} entries`);
```

### How template caching works

```ts
// These queries share the same cached analysis:
mangoToDexie(table, { selector: { type: "post", authorId: 42 } });
mangoToDexie(table, { selector: { type: "page", authorId: 99 } });

// Both normalize to template: { type: $0, authorId: $1 }
// The pushdown strategy (multiEq on type + authorId) is computed once
// Values are applied at runtime via where({ type: values[0], authorId: values[1] })
```

**Benefits**:
- Dramatically improves cache hit rate for parameterized queries
- Reduces memory usage (fewer cache entries)
- Expensive analysis done once per structure, cheap value binding per call

Cache entries expire after 5 minutes of non-use, with the timer resetting on each access.

### Performance optimizations

The implementation is optimized for low-end devices:

- **Template-based caching**: Avoids recomputing pushdown strategies for queries with same structure
- **No `Object.keys()` in hot paths**: Uses `for...in` loops to avoid array allocations
- **Pre-compiled residual predicates**: Residual filters are compiled once per template
- **Parameterized execution**: Values are bound at runtime without recompilation

## When to use

Use `mangoToDexie` when you're querying a Dexie `Table` and want:

- Automatic pushdown for common indexable predicates
- In‑memory correctness via the same `MangoSelector` semantics used by `mangoCompile`
- Optional sort/limit handling in one place
- Full Mango query syntax support (all operators work, some pushed down, rest in memory)
- Cached query analysis for repeated queries

> Back to overview: [README](./README.md)
