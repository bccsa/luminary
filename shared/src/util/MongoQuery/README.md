# Mongo Query functions

(Minimal) Mongo-query like implementations and helper functions:

## mongoToDexieFilter and mongoToDexieQuery

Converts MongoDB-style queries to Dexie/IndexedDB-compatible filters and query chains. This utility enables you to use familiar MongoDB query syntax while leveraging Dexie's indexed database performance.

**Key Features:**

- Translates Mongo query operators (`$gt`, `$lt`, `$gte`, `$lte`, `$ne`, `$or`, `$and`) to Dexie predicates
- Automatically pushes indexed field queries to Dexie's optimized `where()` clauses
- Supports MongoDB-style sorting (`$sort`) and limiting (`$limit`)
- Falls back to in-memory filtering for non-indexed fields
- Type-safe with TypeScript support

**Usage:**

```typescript
// Simple filter conversion
const predicate = mongoToDexieFilter({ age: { $gte: 18 } });
const adults = await db.users.filter(predicate).toArray();

// Full query translation with optimization
const query = { age: { $gte: 18 }, $sort: [{ name: "asc" }], $limit: 10 };
const result = await mongoToDexieQuery(db.users, query, {
    indexedFields: ["age", "name"],
}).toArray();
```

## mongoFilter

_(To be implemented)_

Filters an array using a Mongo Query
