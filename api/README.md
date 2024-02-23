# Luminary API

API for Luminary, built with [Nest](https://github.com/nestjs/nest) and [CouchDB](https://couchdb.apache.org/).

## Installation

1. Copy the environment variable file and fill in required fields, such as the database connection string:

```sh
cp .env.example .env
```

2. Install dependencies:

```sh
$ npm ci
```

## Running the app

By default the app will run at http://localhost:3000.

3. Run the server:

```sh
# development
$ npm run start

# watch mode
$ npm run start:dev # or just 'dev'

# production mode
$ npm run start:prod
```

## Test

Copy and `.env.test.example` file to `.env.test` and set the required values, such as the database connection string.

```sh
cp .env.test.example .env.test
```

Run the unit tests:

```sh
# unit tests
$ npm run test:unit

# test coverage
$ npm run test:cov
```

## Lint

```sh
# lint code and output errors
$ npm run lint

# lint code and fix auto-fixable errors
$ npm run lint:fix
```
