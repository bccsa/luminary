# MangoQuery guide

A practical, example-led introduction to the **Mango selector** syntax used to
query data in this project. The
[official CouchDB Mango docs](https://docs.couchdb.org/en/stable/ddocs/mango.html)
are the authoritative reference. This guide is an on-ramp for using MangoQuery in
Luminary: it teaches the syntax by example and frames everything around how
queries are actually written here. Read it first, then reach for the reference
docs when you need exhaustive detail.

> **Already know Mango?** Skip to the reference docs:
> [mangoCompile](./mangoCompile.md) (in-memory filtering, full operator list),
> [mangoToDexie](./mangoToDexie.md) (Dexie index pushdown), and the
> [HybridQuery](../HybridQuery/README.md) (routing, live mode, caching).

## What is a Mango query?

A **selector** is a plain JSON object that describes *which documents match*. It
is the same selector language CouchDB's `_find` uses, so the queries you write on
the client are valid against the server too.

```ts
// "every document whose `type` field equals 'post'"
{ selector: { type: "post" } }
```

The selector lives inside a `MangoQuery` envelope. Only `selector` is required:

```ts
type MangoQuery = {
    selector: MangoSelector; // which docs match (required)
    $sort?: Array<Record<string, "asc" | "desc">>; // ordering, e.g. [{ publishDate: "desc" }]
    $limit?: number; // max number of results
    use_index?: string; // CouchDB index hint (see "Sorting & limiting")
};
```

> **Note:** an empty selector `{}` matches **every** document; a non-object
> selector (`null`, a number, a string) matches **nothing**. Field values are
> matched with CouchDB type-aware semantics (type order: `null` < boolean <
> number < string < array < object).

## Where you write selectors in Luminary

You rarely call CouchDB directly — you pass a selector to one of the query
helpers, and it decides where to read from (local IndexedDB, the API, or both):

| Helper | Use it when |
| --- | --- |
| `useHybridQuery(query, options?)` | The default for components — a reactive, local-first read that supplements from the API for older / missing / non-synced docs. |
| `HybridQuery` (class) | Same as above, outside a component (you own `dispose()`). |
| `queryLocal(query)` | Awaitable one-shot read of the **local** IndexedDB cache only. |
| `queryRemote(query)` | Awaitable one-shot read of the **remote** `/query` API only. |
| `mangoToDexie(table, query)` | Run a selector against a Dexie table directly, with index pushdown. |
| `mangoCompile(selector)` | Compile a selector into an `(doc) => boolean` predicate to filter data already in memory. |

Every one of them speaks the same selector syntax. A minimal component read:

```ts
import { useHybridQuery, DocType } from "luminary-shared";

const posts = useHybridQuery<PostDto>({
    selector: { type: DocType.Post },
});
// template: <li v-for="p in posts" :key="p._id">{{ p._id }}</li>
```

The rest of this guide is about everything you can put inside `selector`.

## Matching a field

The simplest condition is a field set to a value — that's **implicit equality**:

```ts
{ type: "post" } // type === "post"
```

You can write it explicitly with `$eq` (identical meaning):

```ts
{ type: { $eq: "post" } }
```

Multiple fields at the same level are **implicitly AND-ed** — all must match:

```ts
{ type: "post", language: "en" } // type === "post" AND language === "en"
```

Use **dot notation** to reach into nested objects:

```ts
// these two are equivalent
{ "imdb.rating": 8 }
{ imdb: { rating: 8 } }
```

## Comparison operators

Wrap the value in an object with an operator key to compare instead of equate:

| Operator | Matches when the field… |
| --- | --- |
| `$eq` | equals the value |
| `$ne` | exists **and** does not equal the value (see [Gotchas](#gotchas)) |
| `$gt` / `$gte` | is greater than / greater-or-equal to the value |
| `$lt` / `$lte` | is less than / less-or-equal to the value |

```ts
{ publishDate: { $gt: 1700000000000 } } // published after this timestamp
{ status: { $ne: "draft" } } // any status except "draft" (field must exist)
```

Combine two operators on the same field to express a **range** (they're AND-ed):

```ts
{ score: { $gte: 18, $lte: 65 } } // 18 <= score <= 65
```

> See [mangoCompile › Comparison operators](./mangoCompile.md#comparison-operators)
> for the exact comparison rules (strings compare via `localeCompare`).

## Sets & arrays

### Is the value one of a set? — `$in` / `$nin`

```ts
{ status: { $in: ["draft", "published"] } } // status is one of these
{ status: { $nin: ["archived", "deleted"] } } // status is none of these (field must exist)
```

### Querying an array field — `$all`, `$elemMatch`, `$allMatch`, `$size`

When the field itself is an **array**, use array operators:

| Operator | Matches when the array… |
| --- | --- |
| `$all` | contains **all** of the given elements (order/extra elements don't matter) |
| `$elemMatch` | has **at least one** element matching the sub-selector |
| `$allMatch` | has **every** element matching the sub-selector (an empty array never matches) |
| `$size` | has exactly this many elements |

```ts
// the array contains ALL of these elements
{ tags: { $all: ["featured", "published"] } }

// at least ONE element matches a sub-selector
{ items: { $elemMatch: { price: { $gt: 100 } } } }

// for an array of primitives, match elements with $eq
{ genres: { $elemMatch: { $eq: "Horror" } } }

// EVERY element must match (e.g. all scores are passing)
{ scores: { $allMatch: { $gte: 50 } } }

// exact array length
{ tags: { $size: 3 } }
```

`$elemMatch` shows up a lot in this codebase for filtering content by its
`parentTags` array — see [Real Luminary patterns](#real-luminary-patterns).

> **Tip:** there is no `$contains` operator. To check "array contains value `v`",
> write `{ field: { $elemMatch: { $eq: v } } }`.

> **API limit:** against the server, `$elemMatch` is only allowed on `memberOf`,
> `availableTranslations`, `parentTags`, and `tags`. On any other field it works
> locally but is rejected by the API — see
> [What the API rejects](#what-the-api-rejects).

## Existence, type & maps

```ts
{ summary: { $exists: true } } // doc has a `summary` field
{ deletedAt: { $exists: false } } // doc has NO `deletedAt` field
{ value: { $type: "string" } } // `value` is a string
```

`$type` accepts `"null"`, `"boolean"`, `"number"`, `"string"`, `"array"`, or
`"object"`. `$exists` is the escape hatch for the missing-field gotcha below.

When a field holds a **map** (an object used as a key→value dictionary rather
than a fixed-shape record), `$keyMapMatch` tests whether **any key** matches a
sub-selector:

```ts
// matches if the `cameras` map has any key equal to "secondary"
{ cameras: { $keyMapMatch: { $eq: "secondary" } } }
```

## String & pattern operators

For text fields, match by pattern instead of exact value:

| Operator | Matches when the field… |
| --- | --- |
| `$beginsWith` | starts with the given prefix (**case-sensitive**) |
| `$regex` | matches the given regular-expression pattern (an invalid pattern matches nothing) |

```ts
{ slug: { $beginsWith: "blog-" } } // "blog-intro", "blog-2024", …
{ title: { $regex: "^The" } } // title starts with "The"
{ email: { $regex: "@gmail\\.com$" } } // email ends with @gmail.com
```

> **Note:** `$beginsWith` is the one pattern operator the local Dexie path can
> push down to an index (as a prefix scan); `$regex` is always evaluated in
> memory. Prefer `$beginsWith` for prefix matches on indexed fields.

> **API limit:** `$regex` is **rejected by the API** — it only works on local
> reads. For a query that can hit the server, use `$beginsWith` or filter in
> memory instead. See [What the API rejects](#what-the-api-rejects).

## Numeric operators

`$mod` matches on a modulo (remainder) operation. Both the field value and the
two arguments must be integers:

```ts
// value % 10 === 1  →  matches 1, 11, 21, 31, …
{ value: { $mod: [10, 1] } } // [divisor, remainder]
```

## Combining conditions

For anything beyond implicit AND, use the **combination operators**. These are
top-level keys, not field conditions:

| Operator | Matches when… |
| --- | --- |
| `$and` | every selector in the array matches |
| `$or` | at least one selector in the array matches |
| `$not` | the given selector does **not** match |
| `$nor` | **none** of the selectors in the array match |

```ts
// all conditions
{ $and: [{ type: "post" }, { language: "en" }] }

// any condition
{ $or: [{ status: "published" }, { score: { $gte: 90 } }] }

// negate a condition
{ $not: { status: "archived" } }

// none of these
{ $nor: [{ status: "deleted" }, { status: "archived" }] }
```

These nest freely. A typical real query mixes a top-level `$and` with field
conditions and an `$or`:

```ts
{
    $and: [
        { type: "post" },
        { language: "en" },
        { $or: [{ pinned: true }, { score: { $gte: 90 } }] },
    ],
}
```

> **Note:** `$not` is a **top-level** combination operator, not a field operator.
> Write `{ $not: { role: "guest" } }`, not `{ role: { $not: "guest" } }`.

## Sorting & limiting

`$sort` and `$limit` live on the `MangoQuery` envelope, next to `selector`:

```ts
{
    selector: { type: "post" },
    $sort: [{ publishDate: "desc" }], // newest first
    $limit: 10, // at most 10 results
}
```

`$sort` is an array of `{ field: "asc" | "desc" }` objects. In the local Dexie
path only the **first** sort field is honoured.

`use_index` is an optional **CouchDB index hint** forwarded to the API. It names a
design doc that materialises the index; the API only accepts an allowlisted name
(an unknown one is rejected). You usually don't need it — but complex Content
queries should pin one. See
[HybridQuery › Pinning the CouchDB index](../HybridQuery/README.md#pinning-the-couchdb-index).

## What the API rejects

Everything above is accepted by the **local** query engine — `mangoCompile`,
`mangoToDexie`, `queryLocal`, and the local Dexie read inside `HybridQuery`. The
**API** that backs remote reads is stricter: `queryRemote`, and the API
supplement `HybridQuery` fires for older / missing / non-synced docs, both go
through a server-side validator that **rejects** disallowed syntax with a
`400 Bad Request` (`Invalid query: <reason>`).

A selector can therefore pass locally but be rejected once it reaches the server.
**Write to the stricter rules whenever a query can hit the API** (anything using
`queryRemote`, or a `HybridQuery`/`useHybridQuery` over Content or a non-synced
type):

| Not allowed | Use instead | Rejected example |
| --- | --- | --- |
| `$regex` | `$beginsWith` for prefixes, or filter in memory | `{ title: { $regex: "^The" } }` |
| `$where` | — (no server-side JS) | `{ $where: "…" }` |
| `$elemMatch` **except** on `memberOf`, `availableTranslations`, `parentTags`, `tags` | restructure, or filter the field locally | `{ items: { $elemMatch: { price: { $gt: 1 } } } }` |
| `null` / `undefined` inside `$in` / `$nin` / `$all` | strip them first (HybridQuery does this for you) | `{ tags: { $in: ["a", null] } }` |
| `$limit` above **500** | request ≤ 500 (the cap is rejected, **not** clamped) | `$limit: 1000` |
| `use_index` not in the design-doc allowlist | an existing index name (see below) | `use_index: "made-up-index"` |
| selector nesting deeper than **12** levels | flatten the logic | deeply nested `$and` / `$or` |
| selector with more than **256** clauses | (array elements don't count) | hundreds of `$or` branches |

> **Note:** these checks are about query *shape* only — they are **not** the
> permission boundary. The server always injects permission and
> published/expiry filters on top of your selector, so a shape-valid selector can
> still only ever narrow what you're already allowed to see. The internal
> `crypto` doc type is never queryable.

## Gotchas

These are the behaviours the CouchDB docs gloss over but that bite in practice.

### A missing field never matches a condition — even a negation

Per CouchDB, a field-level condition requires the field to **exist**. A document
that lacks the queried field is **excluded** — and this includes the negations
`$ne` and `$nin`:

```ts
{ parentPostType: { $ne: "page" } }
// Matches docs that HAVE parentPostType and whose value !== "page".
// A doc with NO parentPostType is EXCLUDED.
```

To match "field is absent **or** not equal", opt in explicitly with `$or` +
`$exists: false`:

```ts
{ $or: [{ parentPostType: { $exists: false } }, { parentPostType: { $ne: "page" } }] }
```

This rule is for field-level conditions; inside `$elemMatch`/`$allMatch` an array
element always "exists", so element-level `$ne`/`$nin` are not existence-gated.
Full detail: [mangoCompile › Missing fields](./mangoCompile.md#missing-fields-couchdb-parity).

### `null` inside `$in` / `$nin` / `$all` crashes the server

A `null` (or `undefined`) member of `$in`/`$nin`/`$all` makes CouchDB's `_find`
return a 500. Two layers protect you: `HybridQuery` strips them automatically
before a query forks to the local read and the remote POST (so
`{ $in: ["a", null, "b"] }` becomes `{ $in: ["a", "b"] }`), and the API validator
rejects any that slip through with a `400` instead of letting CouchDB 500. Still,
don't construct such arrays in raw `queryRemote` calls — strip them yourself.

### An empty `$in` matches nothing — and short-circuits

`{ $in: [] }` is unsatisfiable. When it sits in a conjunctive (AND) position,
`HybridQuery` and `mangoToDexie` detect it as **provably empty** and skip the
work entirely — no Dexie read, no API POST. This is why a filter built from an
empty list (e.g. "posts in *these* categories" with no categories selected)
correctly yields `[]` without scanning anything.

### To drop a field, omit it — never set it to `undefined`

`{ x: undefined }` does **not** mean "ignore x". To Mango it means "x must be
missing", which is a real (and usually unintended) condition. When building a
selector conditionally, leave the field out entirely rather than assigning
`undefined`.

### Unknown operators silently fail

An operator that isn't in the spec (e.g. `$contains`) makes that condition
evaluate to `false` and logs a `[MangoQuery] Unsupported field operator …`
warning. If a query returns nothing unexpectedly, check the console. Common
fixes: `$contains` → `$elemMatch: { $eq: v }`; field-level `$not` → top-level
`$not`. See
[mangoCompile › Debugging unsupported operators](./mangoCompile.md#debugging-unsupported-operators).

## Real Luminary patterns

### Published, sorted content with a pinned index

The canonical Content read combines a top-level `$and`, a `$ne` filter, a
published-status clause, descending sort, and a pinned CouchDB index:

```ts
const items = useHybridQuery<ContentDto>({
    selector: {
        $and: [
            { type: DocType.Content },
            { parentPostType: { $ne: PostType.Page } },
            ...mangoIsPublished(appLanguageIds), // status/expiry/language clauses
        ],
    },
    $sort: [{ publishDate: "desc" }],
    $limit: 10,
    use_index: "content-publishDate-index",
});
```

> **Content auto-appends a cutoff.** For `type === "content"`, the remote
> supplement automatically appends `publishDate <= cutoff` to your selector (the
> newest content is always synced locally, so the API only supplies the older
> tail). Any `use_index` you pin must therefore cover `publishDate`. See
> [HybridQuery › The content cutoff](../HybridQuery/README.md#the-content-cutoff).

### Filtering by tags with `$elemMatch` (reactive)

Content carries a `parentTags` array; filter it with `$elemMatch` + `$in`. Pass a
**thunk** so the query rebuilds when the selected categories change:

```ts
const items = useHybridQuery<ContentDto>(
    () => ({
        selector: { parentTags: { $elemMatch: { $in: pinnedCats.value } } },
    }),
    { live: true }, // rebuilds whenever pinnedCats changes
);
```

If `pinnedCats.value` is `[]`, the `$in: []` makes this
[provably empty](#an-empty-in-matches-nothing--and-short-circuits) and the query
yields `[]` without doing any work.

## Operator quick reference

Every operator the selector syntax supports, in one place.

**Combination** (top-level keys):

| Operator | Argument | Matches when |
| --- | --- | --- |
| `$and` | selector[] | every selector matches |
| `$or` | selector[] | at least one selector matches |
| `$not` | selector | the selector does not match |
| `$nor` | selector[] | none of the selectors match |

**Field conditions** (under a field name) — all require the field to **exist**:

| Operator | Argument | Matches when the field… |
| --- | --- | --- |
| `$eq` | any | equals the value (also the implicit `{ field: value }` form) |
| `$ne` | any | exists and does not equal the value |
| `$gt` / `$gte` | number/string | is greater than / greater-or-equal |
| `$lt` / `$lte` | number/string | is less than / less-or-equal |
| `$in` | any[] | value is one of the array |
| `$nin` | any[] | value is none of the array |
| `$all` | any[] | array field contains all of the elements |
| `$elemMatch` | selector | array field has ≥1 element matching |
| `$allMatch` | selector | array field has every element matching |
| `$size` | number | array field has exactly this length |
| `$exists` | boolean | field is present (`true`) / absent (`false`) |
| `$type` | string | value is of this type (`"null"`, `"boolean"`, `"number"`, `"string"`, `"array"`, `"object"`) |
| `$keyMapMatch` | selector | map field has any key matching |
| `$beginsWith` | string | string field starts with the prefix (case-sensitive) |
| `$regex` | string | string field matches the regex pattern |
| `$mod` | [div, rem] | `value % div === rem` (integers only) |

**Envelope** (siblings of `selector`): `$sort`, `$limit`, `use_index` — see
[Sorting & limiting](#sorting--limiting).

> **Note:** these are the operators the local engine implements. Anything else
> (e.g. `$contains`) is unsupported — see [Unknown operators silently fail](#unknown-operators-silently-fail).
> Some of these are further restricted when a query hits the server (`$regex`,
> `$where`, `$elemMatch`) — see [What the API rejects](#what-the-api-rejects).

## Where to go next

| Doc | Covers |
| --- | --- |
| [mangoCompile](./mangoCompile.md) | Exact in-memory matching semantics and edge cases (type-aware equality, `localeCompare` string ordering, cache internals). |
| [mangoToDexie](./mangoToDexie.md) | How selectors are pushed down to IndexedDB indexes, and which operators fall back to in-memory filtering. |
| [HybridQuery](../HybridQuery/README.md) | Local-vs-remote routing, live mode, response caching, offline persistence, and the content cutoff. |
