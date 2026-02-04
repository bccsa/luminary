# mangoCompile

This module provides a comprehensive compiler that turns a Mango query selector into a JavaScript predicate function you can use to filter in-memory data.

The compiler supports the full CouchDB Mango query syntax, making it compatible with queries used against CouchDB databases.

> See also: [mangoToDexie](./mangoToDexie.md) for translating Mango queries into Dexie collections with pushdown.

## Core concept

Use `mangoCompile(selector)` to get back a function `(doc) => boolean`. That function returns `true` when the document matches the selector.

**Caching**: Compiled predicates are automatically cached based on query structure. Cache entries expire after 5 minutes of non-use, with the timer resetting on each access. This eliminates redundant compilation when the same queries are used repeatedly.

```ts
import { mangoCompile } from "./mangoCompile";

const selector = { $and: [{ city: "SF" }, { score: { $gte: 90 } }] };
const matches = mangoCompile(selector);

[
    { city: "SF", score: 95 },
    { city: "LA", score: 95 },
].filter(matches);
// → [ { city: "SF", score: 95 } ]
```

## Supported selector shape

Top-level selector is an object. An empty object `{}` matches all documents. Non-object values (e.g. `null`, number, string) are treated as invalid selectors and compile to a predicate that always returns `false`.

## Nested field access (dot notation)

Fields can use dot notation to access nested properties:

```ts
// These are equivalent:
{ "imdb.rating": 8 }
{ imdb: { rating: 8 } }

// With operators:
{ "user.profile.age": { $gte: 18 } }
```

## Combination operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$and` | Array | Matches if all selectors in the array match |
| `$or` | Array | Matches if any of the selectors in the array match |
| `$not` | Selector | Matches if the given selector does not match |
| `$nor` | Array | Matches if none of the selectors in the array match |

Examples:

```ts
// $and: all conditions must match
{ $and: [{ city: "SF" }, { score: { $gte: 90 } }] }

// $or: at least one condition must match
{ $or: [{ city: "LA" }, { score: { $gte: 95 } }] }

// $not: negate a condition
{ $not: { status: "archived" } }

// $nor: none of the conditions should match
{ $nor: [{ status: "deleted" }, { status: "archived" }] }
```

### Implicit operators

Multiple fields at the same level are implicitly AND-ed:

```ts
// These are equivalent:
{ city: "NYC", active: true }
{ $and: [{ city: "NYC" }, { active: true }] }
```

## Condition operators

### Equality operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$eq` | Any | Field equals the argument |
| `$ne` | Any | Field does not equal the argument |

```ts
{ city: { $eq: "NYC" } }  // explicit equality
{ city: "NYC" }           // implicit equality (shorthand)
{ score: { $ne: 0 } }     // not equal
```

### Comparison operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$gt` | Number/String | Field is greater than the argument |
| `$lt` | Number/String | Field is less than the argument |
| `$gte` | Number/String | Field is greater than or equal to the argument |
| `$lte` | Number/String | Field is less than or equal to the argument |

```ts
{ score: { $gt: 80 } }         // greater than
{ age: { $gte: 18, $lte: 65 }} // range (multiple operators AND-ed)
{ name: { $gt: "Bob" } }       // string comparison (using localeCompare)
```

### Array membership operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$in` | Array | Document field value is in the provided array |
| `$nin` | Array | Document field value is not in the provided array |

```ts
{ status: { $in: ["draft", "published"] } }
{ status: { $nin: ["archived", "deleted"] } }
```

### Array field operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$all` | Array | Array field contains all elements of the argument array |
| `$elemMatch` | Selector | Array field has at least one element matching the selector |
| `$allMatch` | Selector | All elements in array field match the selector |
| `$size` | Number | Array field has exactly this many elements |

```ts
// $all: array must contain all specified elements
{ tags: { $all: ["javascript", "typescript"] } }

// $elemMatch: at least one element matches
{ items: { $elemMatch: { price: { $gt: 100 } } } }
{ genre: { $elemMatch: { $eq: "Horror" } } }  // for primitive arrays

// $allMatch: all elements must match
{ scores: { $allMatch: { $gte: 50 } } }

// $size: exact array length
{ tags: { $size: 3 } }
```

### Object/field operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$exists` | Boolean | Check whether the field exists |
| `$type` | String | Check the document field's type |
| `$keyMapMatch` | Selector | Map contains at least one key matching the selector |

```ts
// $exists: check field presence
{ email: { $exists: true } }
{ deleted: { $exists: false } }

// $type: check field type ("null", "boolean", "number", "string", "array", "object")
{ value: { $type: "string" } }
{ tags: { $type: "array" } }

// $keyMapMatch: check if map has a key matching selector
{ cameras: { $keyMapMatch: { $eq: "secondary" } } }
```

### String/pattern operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$regex` | String | Field matches the regular expression pattern |
| `$beginsWith` | String | Field begins with the specified prefix (case-sensitive) |

```ts
// $regex: regular expression matching
{ title: { $regex: "^The" } }      // starts with "The"
{ email: { $regex: "@gmail\\.com$" } }  // ends with @gmail.com

// $beginsWith: prefix matching
{ name: { $beginsWith: "John" } }  // "John", "Johnny", "John Doe"
```

### Numeric operators

| Operator | Argument | Purpose |
|----------|----------|---------|
| `$mod` | [Divisor, Remainder] | Field modulo Divisor equals Remainder |

```ts
// $mod: modulo operation (field must be integer)
{ value: { $mod: [10, 1] } }  // value % 10 === 1 (11, 21, 31, ...)
```

## Complex query examples

### Combining operators

```ts
// Movies with high rating OR recent
{
    $or: [
        { "imdb.rating": { $gte: 8 } },
        { year: { $gte: 2020 } }
    ]
}

// Active users who are not guests
{
    $and: [
        { status: "active" },
        { $not: { role: "guest" } }
    ]
}

// CouchDB-style partial index query
{
    year: { $gte: 1900, $lte: 1903 },
    $not: { year: 1901 }
}
```

## Edge cases and behavior

- Empty selector `{}` → predicate always returns `true`
- Non-object selector (e.g., `null`, `42`, `"x"`) → predicate always returns `false`
- **Unknown/unsupported operators** inside a field comparison cause that condition to evaluate to `false` and log a warning to the console (e.g., `[MangoQuery] Unsupported field operator "$contains" for field "tags"`)
- Equality uses CouchDB-style type-aware comparison (type order: null < boolean < number < string < array < object)
- String comparison uses `localeCompare` for ordering
- `$regex` returns `false` for invalid regex patterns
- `$mod` requires integer values for both the field and the divisor/remainder
- `$allMatch` returns `false` for empty arrays

### Debugging unsupported operators

When you see a warning like:

```
[MangoQuery] Unsupported field operator "$contains" for field "availableTranslations". Supported operators: $eq, $ne, $gt, $lt, $gte, $lte, $in, $nin, $exists, $type, $size, $mod, $regex, $beginsWith, $all, $elemMatch, $allMatch, $keyMapMatch. This condition will always return false.
```

This means you're using an operator that doesn't exist in the Mango query specification. Common mistakes:

- `$contains` → Use `$elemMatch: { $eq: value }` to check if array contains a value
- `$notContains` → Use top-level `$not: { field: { $elemMatch: { $eq: value } } }`
- Field-level `$not` → Move `$not` to the top level as a combination operator

## Type hints

`mangoCompile` consumes a `MangoSelector` type defined in `MangoTypes.ts`. In TypeScript, you can author selectors with type safety for supported shapes, but for dynamic inputs you can still pass them at runtime; invalid shapes simply won't match.

## Cache management

Compiled predicates are cached automatically. Use these utilities to manage the cache:

```ts
import { clearMangoCache, getMangoCacheStats } from "./mangoCompile";

// Clear all cached predicates (useful for memory management)
clearMangoCache();

// Get cache statistics
const stats = getMangoCacheStats();
console.log(`Cache size: ${stats.size}`);
console.log(`Cached queries: ${stats.keys}`);
```

### Cache behavior

- **Automatic caching**: Queries are cached using a fast hash of their JSON representation
- **5-minute expiry**: Unused cache entries are automatically removed after 5 minutes
- **Resettable timer**: Each cache hit resets the entry's expiry timer
- **Memory-efficient**: Empty and invalid queries are not cached

### Performance tradeoff: Key order sensitivity

Cache keys are generated using `JSON.stringify()` + a fast djb2 hash. This approach was chosen over recursive key sorting for better performance on low-end devices:

| Approach | Cache key generation | Key normalization |
|----------|---------------------|-------------------|
| **Sort + stringify** | Slower (recursive traversal, object allocation, sorting) | Normalized (same cache entry for different key orders) |
| **Stringify + hash** ✓ | Faster (single-pass hash, no allocations) | Not normalized (different key orders = different entries) |

**Consequence**: Semantically equivalent queries with different key orders are cached separately:

```ts
mangoCompile({ a: 1, b: 2 });  // Cache entry #1
mangoCompile({ b: 2, a: 1 });  // Cache entry #2 (different key order)
```

**Why this is acceptable**:
- Most applications construct queries via the same code path, producing consistent key order
- A cache miss only means recompiling once, not incorrect behavior
- The performance gain on every cache key generation outweighs occasional duplicate entries
- Memory impact is minimal since entries auto-expire after 5 minutes of non-use

## When to use

Use `mangoCompile` for client-side filtering where you:

- Already have data in memory
- Want a familiar Mango query shape compatible with CouchDB
- Need a dependency-free matcher with predictable behavior

> Next: Learn how to execute a Mango query against Dexie with pushdown in [mangoToDexie](./mangoToDexie.md).
