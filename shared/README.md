# Luminary frontent shared library

This library contains essential building blocks for building a front-end application for the Luminary sync API

## Local setup

```sh
cd shared
npm ci
```

The library should be added to front-end projects as an NPM import. For projects belonging to the Luminary mono-repo, this can be done by installing as follows:

```sh
npm install ../shared
```

## Build

For changes (to the shared library) to be available in consuming projects in the Luminary mono-repo, the shared library should be built by running:

```sh
npm run build
```

## Unit testing

```sh
npm run test
```
