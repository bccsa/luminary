<p align="center">
  <img src="https://github.com/bccsa/luminary/blob/main/logo.svg?raw=true" width="120" style="margin-bottom: 10px;">
</p>

Offline-first content platform consisting of an API, CMS, web app and native apps.

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
