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
