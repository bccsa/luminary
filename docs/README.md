# Luminary documentation

Index of documentation in this folder. Package-specific handbooks live in each package's `README.md` (`api/`, `app/`, `cms/`, `shared/`).

## Architecture decisions

Recorded in [`adr/`](adr/). Start with [ADR 0001 — Record architecture decisions](adr/0001-record-architecture-decisions.md). Cross-package contracts are especially important: [ADR 0005 — Backwards compatibility](adr/0005-backwards-compatibility.md).

## Guides

Contributor and workflow documentation:

| Guide | Description |
|-------|-------------|
| [setup-vue-app.md](guides/setup-vue-app.md) | VS Code setup, env, running app and CMS locally |
| [translations.md](guides/translations.md) | i18n keys, CouchDB language docs, interpolation |
| [project-automation.md](guides/project-automation.md) | Git hooks and `automate-luminary.sh` CLI |
| [api-testing.md](guides/api-testing.md) | API unit testing notes (Jest, CouchDB reuse) |

## Architecture

Cross-cutting system design:

| Doc | Description |
|-----|-------------|
| [rest-api/README.md](architecture/rest-api/README.md) | REST bulk sync API and SyncMap |
| [socket-io-messages.md](architecture/socket-io-messages.md) | Socket.io message reference (API ↔ clients) |
| [diagrams/](architecture/diagrams/) | ACL, sync, datamodel, permissions, client data flows |

## Features

Feature-specific documentation (design, diagrams, constants):

| Feature | Description |
|---------|-------------|
| [vue-plugin-architecture/](features/vue-plugin-architecture/) | Build-time plugin system (`virtual:*`, contracts, provide/inject) |
| [reading-progress-tracker/](features/reading-progress-tracker/) | Segment-based reading progress and Continue Reading |
| [s3-multi-bucket/](features/s3-multi-bucket/) | CMS multi-bucket S3 architecture |

## Research

Exploratory notes that may predate or differ from current ADRs:

| Topic | Description |
|-------|-------------|
| [fts/](research/fts/) | Offline full-text search research (superseded by ADR 0009) |

## Archive

| Path | Description |
|------|-------------|
| [historical-upgrades/](archive/historical-upgrades/) | Retired database schema upgrade scripts (reference only) |
