# Luminary App

This is the frontend of the Luminary app. It's an offline-first Vue app that runs both in the browser and as a "native" app on mobile phones using Capacitor.

## Local setup

Refer to the [setup guide](../docs/setup-vue-app.md).

When running `npm run dev` the local reloading server of the app will start at http://localhost:4174.

### Mobile app

After getting the Vue web app running locally, the mobile apps can be run. These apps are built using [Capacitor](https://capacitorjs.com/) and run in a mobile webview.

#### Prerequisites

Refer to the [Capacitor documentation](https://capacitorjs.com/docs/getting-started/environment-setup) for the local setup. For Android this basically boils down to installing Android Studio, for iOS more steps are involved.

#### Running locally

The app can be started from Xcode/Android Studio. To open the project:

```sh
npx cap open ios
npx cap open android
```

To make sure the latest code is run, use these commands:

```sh
npm run build
npx cap sync
```

## Build for production

The web version of the app can be deployed as a Docker container by building the `Dockerfile`:

```sh
docker build -t ac-app .
docker run --rm -it -p 8080:80 ac-app
```

This will run the app on port 8080 on the host machine.
