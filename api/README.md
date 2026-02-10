# Luminary API

API for Luminary, built with [Nest](https://github.com/nestjs/nest) and [CouchDB](https://couchdb.apache.org/).

## Prerequisites

The following software is needed to run and/or test the Luminary API:

-   CouchDB (document database) - see https://couchdb.apache.org
-   S3 (compatible) storage, e.g. MinIO - see https://min.io

### CouchDB installation

For development purposes, CouchDB can be installed as a docker:

```shell
docker run -p 5984:5984 -d -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=yourpassword couchdb
```

After successfully running CouchDB, create a local database via the CouchDB web interface at http://localhost:5984/\_utils/ using the credentials you set above.

### S3 storage (MinIO)

For development purposes, MinIO can be installed as a docker for S3 compatible storage:

This command will create an instance with a pre-configured access key / secret combination:

```shell
docker run -d -p 9000:9000 -p 9001:9001 --name luminary-storage -e "MINIO_ACCESS_KEY=minio" -e "MINIO_SECRET_KEY=minio123" quay.io/minio/minio server /data --console-address ":9001"
```

```shell
docker run -d \
   -p 9000:9000 \
   -p 9001:9001 \
   --name luminary-storage \
   -e "MINIO_ACCESS_KEY=minio" \
   -e "MINIO_SECRET_KEY=minio123" \
   quay.io/minio/minio server /data --console-address ":9001"
```

If you need to log into the MinIO web console, the root user and password can be passed instead. Note that you manually will have to create an access key / secret combination and update your .env file accordingly. The web console is available on http://localhost:9001

```shell
docker run -d \
   -p 9000:9000 \
   -p 9001:9001 \
   --name luminary-storage \
   -e "MINIO_ROOT_USER=rootuser" \
   -e "MINIO_ROOT_PASSWORD=password" \
   quay.io/minio/minio server /data --console-address ":9001"
```

## Installation

1. Copy the environment variable file and fill in required fields, such as the database connection string:

```sh
cp .env.example .env
```

2. Install dependencies:

```sh
$ npm ci
```

## Running the API

3. Seeding the database:

Before running Luminary against a clean CouchDB database it is recommended to seed the database with the default document set. This document set is also used for unit tests, and should help you to get a functional setup to start with.

```sh
$ npm run seed
```

By default the API will run at http://localhost:3000.

4. Run the server:

```sh
# development
$ npm run start

# watch mode
$ npm run start:dev # or just 'dev'

# production mode
$ npm run build
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

## Logging

In production mode (`npm run start:prod`) the API logs are stored in a tailable api.log file. The log files are rotated when the size exceeds 1MB and only the latest 5 files are being kept. In development mode logs are printed to the console.

## Load testing

The load tester currently tests the API for Luminary Client app sync loads on the /query API endpoint.

```sh
# load tester help
$ npx ts-node load_tester --help
```

## Security: npm overrides

This package uses **npm overrides** to manage security vulnerabilities in transitive dependencies. The `overrides` field in `package.json` forces specific versions of packages throughout the dependency tree.

### Current overrides:

- **lodash** → `^4.17.23` - Fixes prototype pollution vulnerability ([GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg))
- **fast-xml-parser** → `^5.3.4` - Fixes DoS vulnerability ([GHSA-37qj-frw5-hhjh](https://github.com/advisories/GHSA-37qj-frw5-hhjh))
- **fastify** → `^5.7.3` - Fixes DoS and content-type bypass ([GHSA-mrq3-vjjr-p77c](https://github.com/advisories/GHSA-mrq3-vjjr-p77c), [GHSA-jx2c-rxcm-jvmq](https://github.com/advisories/GHSA-jx2c-rxcm-jvmq))
- **@fastify/middie** → `^9.0.4` - Fixes path bypass vulnerability ([GHSA-cxrg-g7r8-w69p](https://github.com/advisories/GHSA-cxrg-g7r8-w69p))

### Why overrides?

Many vulnerabilities exist in **transitive dependencies** (dependencies of our dependencies). Using overrides allows us to fix these immediately without waiting for parent packages to update.

### Maintenance

When adding or updating overrides:
1. Identify the vulnerability and required version
2. Update the `overrides` section in `package.json`
3. Run `npm install` to apply changes
4. Test thoroughly: `npm run build && npm run test`
5. Update this README with the vulnerability information

For more details, see:
- [SECURITY.md](../SECURITY.md) - Complete security policy
- [ADR 0008](../docs/adr/0008-npm-overrides-for-security.md) - Decision rationale
