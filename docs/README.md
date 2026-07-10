# Luminary documentation

This folder holds only **cross-cutting** documentation — architecture decisions, diagrams that
span multiple packages, and guides that don't belong to a single package. Documentation
describing a single package's own implementation lives in that package instead, referenced from
its `README.md` (and `CLAUDE.md`): [api/](../api/README.md), [app/](../app/README.md),
[cms/](../cms/README.md), [shared/](../shared/README.md).

## Architecture decisions

Recorded in [`adr/`](adr/). Start with [ADR 0001 — Record architecture decisions](adr/0001-record-architecture-decisions.md). Cross-package contracts are especially important: [ADR 0005 — Backwards compatibility](adr/0005-backwards-compatibility.md).

## Guides

Contributor and workflow documentation spanning more than one package:

| Guide | Description |
|-------|-------------|
| [setup-vue-app.md](guides/setup-vue-app.md) | VS Code setup, env, running app and CMS locally |
| [translations.md](guides/translations.md) | i18n keys, CouchDB language docs, interpolation |

Repo-wide local dev environment setup (CouchDB/MinIO/env files) is the [setup wizard in `scripts/`](../scripts/README.md).

## Architecture diagrams

Cross-cutting system design:

| Doc | Description |
|-----|-------------|
| [diagrams/](architecture/diagrams/) | ACL, sync, datamodel, permissions, client data flows |

Package-specific architecture now lives with its code:

- REST bulk sync API, Socket.io messages, S3 multi-bucket storage — [api/docs/](../api/docs/), linked from [api/README.md](../api/README.md)
- Build-time Vue plugin system — [app/docs/vue-plugin-architecture/](../app/docs/vue-plugin-architecture/), linked from [app/README.md](../app/README.md)
- Offline FTS (trigram + BM25) — [shared/src/fts/README.md](../shared/src/fts/README.md)

## Archive

| Path | Description |
|------|-------------|
| [historical-upgrades/](archive/historical-upgrades/) | Retired database schema upgrade scripts (reference only) |
