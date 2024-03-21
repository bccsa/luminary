<img src="https://github.com/bccsa/luminary/blob/main/logo.svg?raw=true" width="200" style="margin-bottom: 10px;">

Offline-first content platform consisting of an API, CMS, web app and native apps.

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

Run the API commands from the `./api` directory. See the `.env.example` file in the `./api` directory on creating an `.env` file.

Before running Luminary against a clean CouchDB database it is recommended to seed the database with the default document set. This document set is also used for unit tests, and should help you to get a functional setup to start with.

`npm run seed`

Starting the api:

`npm run start`

Running unit tests:

`npm run test` (once-off testing) or `npm run test:watch` (continous testing)

### CMS

Run the CMS commands from the `./cms` directory. See the `.env.example` file in the `./cms` directory on creating an `.env` file.

Luminary includes a web-server for running the Content Management System web-app.

Starting the webserver:

`npm run dev`

Running CMS unit tests:

`npm run test`

#### Opening the CMS in your browser:

Depending on the port configuration in the `./cms/.env` file, the CMS can be opened in your browser from URL configured in the `VITE_API_URL` variable (e.g. http://localhost:3000).
