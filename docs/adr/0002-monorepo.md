# 2. Monorepo

Date: 2024-01-09

## Status

Accepted

## Context

This project will consist of several parts that will be developed together, like a frontend, API, database and CMS. These could be placed in their own repositories, which would mean multiple PRs are needed to update a feature that touches multiple parts of the codebase.

## Decision

We will use a monorepo, with all parts of the project placed into folders. It should be easy to split up the code later.

## Consequences

The frontend and backend should not become interdependent in code. Where for example shared data models are needed, these can be placed in a separate folder, as to make it possible to split them off to their own repository in the future.
Using a monorepo makes it easy to update frontend and backend in one feature PR.
