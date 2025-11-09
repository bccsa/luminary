# Mongo Query utilities

This folder contains two complementary utilities for working with Mongo‑like selectors in the client:

- mongoCompile: compile a Mongo‑like selector into an in‑memory predicate function
- mongoToDexie: execute a Mongo‑like query against a Dexie table with index pushdown when possible

Use the links below for the full docs:

- mongoCompile: ./mongoCompile.md
- mongoToDexie: ./mongoToDexie.md

## Quick overview

When to use which:

- Use mongoCompile when you already have data in memory and want to filter it with a familiar Mongo‑like shape.
- Use mongoToDexie when you want Dexie/IndexedDB to do part of the work via indexes, with any non‑indexable parts evaluated in memory.

Both utilities share the same selector shape (MSelector), covering equality, `$eq/$ne/$gt/$lt/$gte/$lte`, `$in`, and logical `$and/$or`.
