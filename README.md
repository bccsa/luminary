<img src="https://github.com/bccsa/luminary/blob/main/logo.svg?raw=true" width="200" style="margin-bottom: 10px;">

Offline-first content platform consisting of an API, CMS and web app.

![API](https://github.com/bccsa/luminary/actions/workflows/api-unit-tests.yml/badge.svg) ![Shared library](https://github.com/bccsa/luminary/actions/workflows/shared-unit-tests.yml/badge.svg) ![CMS](https://github.com/bccsa/luminary/actions/workflows/cms-unit-tests.yml/badge.svg) ![App](https://github.com/bccsa/luminary/actions/workflows/app-unit-tests.yml/badge.svg)

## Name

lu·​mi·​nary - ˈlü-mə-ˌner-ē

1. a person of prominence or brilliant achievement
2. a body that gives light

## Folder structure

- `api`: API layer over CouchDB
- `app`: Web and native frontend app
- `cms`: Backend CMS for managing content
- `shared`: Shared library used by the CMS and app
- `docs`: Documentation, including ADRs

## Architectural Decision Records

We record our decisions in the `docs/adr` folder. See the [first ADR](./docs/adr/0001-record-architecture-decisions.md) for more information on this process. You can install [adr-tools](https://github.com/npryce/adr-tools) to manage ADRs locally, such as creating one with this command:

```sh
adr new Branching strategy
```

## Running Luminary

### Quick Start with Docker (Recommended)

> [!TIP]
> This is the easiest way to get started, especially on Windows.

1. **Install Docker**: Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop) is running.
2. **Start**: Run `docker compose -f local-dev/docker-compose.yml up --build -d` in your terminal.
3. **Develop**: Open this folder in VS Code and click "Reopen in Container" when prompted.

See [Docker Setup Guide](./local-dev/docker-setup.md) for full details.

### Manual Setup

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
