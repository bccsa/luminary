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

### Plugins

Plugins can be used to extend the functionality of Luminary.

#### How to add plugins

-   To add a plugin you need to create a plugins folder, somewhere out of the project structure
-   Set the VITE_PLUGIN_PATH env variable in your .env, then vite will go fetch your files at that location and copy it into the [plugins folder](./src/plugins/)

```
VITE_PLUGIN_PATH="../../plugins"
```

-   To let luminary run the plugin you need to add a env variable VITE_PLUGINS to your env file and add an array of the plugins you want to add

```
VITE_PLUGINS=["examplePlugin", "examplePlugin2"]
```

-   Every plugin class should have a constructor function

**The files is being copied everytime before vite build, dev, and test is run**

#### Plugin format

```ts
export class examplePlugin {
    constructor() {
        this.someFunction();
    }

    someFunction() {
        return "res";
    }
}
```

**Important that the filename and the class name is the same, and that the file is a ts file**

## Build for production

The web version of the app can be deployed as a Docker container by building the `Dockerfile`:

```sh
docker build -t luminary-app .
docker run --rm -it -p 8080:80 luminary-app
```

This will run the app on port 8080 on the host machine.
