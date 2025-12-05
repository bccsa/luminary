# mongoCompile

This module provides a minimal, fast compiler that turns a MongoDB‑style query object into a JavaScript predicate function you can use to filter in‑memory data.

The compiler is intentionally small and supports a focused subset of Mongo query syntax that fits typical client‑side filtering needs.

> See also: [mongoToDexie](./mongoToDexie.md) for translating Mongo‑like queries into Dexie collections with pushdown.

## Core concept

Use `mongoCompile(selector)` to get back a function `(doc) => boolean`. That function returns `true` when the document matches the selector.

```ts
import { mongoCompile } from "./mongoCompile";

const selector = { $and: [{ city: "SF" }, { score: { $gte: 90 } }] };
const matches = mongoCompile(selector);

[
    { city: "SF", score: 95 },
    { city: "LA", score: 95 },
].filter(matches);
// → [ { city: "SF", score: 95 } ]
```

## Supported selector shape

Top‑level selector is an object. An empty object `{}` matches all documents. Non‑object values (e.g. `null`, number, string) are treated as invalid selectors and compile to a predicate that always returns `false`.

Supported keys at any level:

- Logical operators
    - `$and`: array of selectors, all must match
    - `$or`: array of selectors, at least one must match
- Field conditions
    - Primitive equality: `{ field: value }` where value is string | number | boolean
    - Comparison object: `{ field: { ...operators } }`

## Field operators

Inside a field comparison object, the following operators are recognized:

- `$eq`: equals (similar to primitive equality { field: value })
- `$ne`: not equals
- `$gt`: greater than (numeric)
- `$lt`: less than (numeric)
- `$gte`: greater than or equal (numeric)
- `$lte`: less than or equal (numeric)
- `$in`: value is included in array

Notes and constraints:

- For `$gt`, `$lt`, `$gte`, `$lte`, the comparison value must be a number and the document field must be a number. Otherwise, the predicate returns `false` for that condition.
- For `$in`, the comparison value must be an array; otherwise, the condition returns `false`.
- Multiple operators can be combined for the same field (they are AND‑ed):

```ts
{ age: { $gte: 18, $lt: 65 } }
```

## Logical operators

Both `$and` and `$or` accept arrays of selectors. Each element is itself a selector (you can nest arbitrarily):

```ts
{
    $or: [{ city: "LA" }, { score: { $gte: 95 } }]
},
{
    $and: [{ city: "SF" }, { score: { $gte: 90 } }]
},
```

If the operand is not an array, the compiler throws an error (helps catch mistakes early).

## Examples

1. Match all (empty):

```ts
{
}
```

2. Simple equality:

```ts
{ city: "NYC" },
```

3. Numeric comparisons on a field:

```ts
{ score: { $gt: 80 } }
{ age: { $gte: 18, $lte: 65 } }
```

4. Inclusion:

```ts
{
    status: {
        $in: ["draft", "published"]
    }
},
```

5. Combine with OR/AND:

```ts
{
    $or: [{ city: "LA" }, { score: { $gte: 95 } }]
},
{
    $and: [{ city: "SF" }, { score: { $gte: 90 } }]
},
```

## Edge cases and behavior

- Empty selector `{}` → predicate always returns `true`.
- Non‑object selector (e.g., `null`, `42`, `"x"`) → predicate always returns `false`.
- Unknown/unsupported operators inside a field comparison cause that condition to evaluate to `false`.
- For numeric operators, non‑numeric operands or non‑numeric field values evaluate to `false` for that condition.
- Equality uses strict equality (`===`).

## Type hints

`mongoCompile` consumes a `MSelector` type defined alongside it. In TS, you can author selectors with type safety for supported shapes, but for dynamic inputs you can still pass them at runtime; invalid shapes simply won’t match.

## When to use

Use `mongoCompile` for client‑side filtering where you:

- Already have data in memory
- Want a familiar Mongo‑like query shape
- Need a tiny, dependency‑free matcher with predictable behavior

> Next: Learn how to execute a Mongo‑like query against Dexie with pushdown in [mongoToDexie](./mongoToDexie.md).
