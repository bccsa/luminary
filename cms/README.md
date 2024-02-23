# Luminary CMS

This is the backend CMS for Luminary, an offline-first Vue app that communicates with the API.

## Local setup

Refer to the [setup guide](../docs/setup-vue-app.md).

When running `npm run dev` the local reloading server of the app will start at http://localhost:4175.

## Build for production

The CMS can be deployed as a Docker container by building the `Dockerfile`:

```sh
docker build -t ac-cms .
docker run --rm -it -p 8080:80 ac-cms
```

This will run the CMS on port 8080 on the host machine.
