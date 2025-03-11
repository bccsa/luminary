<img src="https://github.com/bccsa/luminary/blob/main/logo.svg?raw=true" width="200" style="margin-bottom: 10px;">

Offline-first content platform consisting of an API, CMS, web app and native apps.

![API](https://github.com/github/docs/actions/workflows/api-unit-tests.yml/badge.svg) ![Shared library](https://github.com/github/docs/actions/workflows/shared-unit-tests.yml/badge.svg) ![CMS](https://github.com/github/docs/actions/workflows/cms-unit-tests.yml/badge.svg) ![App](https://github.com/github/docs/actions/workflows/app-unit-tests.yml/badge.svg)

## Name

lu·​mi·​nary - ˈlü-mə-ˌner-ē

1. a person of prominence or brilliant achievement
2. a body that gives light

## Folder structure

- `api`: API layer over CouchDB
- `app`: Web and native frontend app
- `cms`: Backend CMS for managing content
- `docs`: Documentation, including ADRs

## Architectural Decision Records

We record our decisions in the `docs/adr` folder. See the [first ADR](./docs/adr/0001-record-architecture-decisions.md) for more information on this process. You can install [adr-tools](https://github.com/npryce/adr-tools) to manage ADRs locally, such as creating one with this command:

```sh
adr new Branching strategy
```

## Running Luminary

For Visual Studio Code users, `./.vscode/launch.json` includes debug configurations for the API, CMS and reference App.

### API

See the [API readme](./api/README.md)

### CMS

See the [CMS readme](./cms/README.md)

### App

See the [App readme](./app/README.md)

### Shared library

See the [Shared readme](./shared/README.md)

### Project automation

See the [Project automation readme](./docs/project-addons/automation/project-automation.md)
