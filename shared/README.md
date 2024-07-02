# Luminary frontent shared library

This library contains essential building blocks for building a front-end application for the Luminary sync API

## Installation

```sh
npm install luminary-shared
```

_Note_

Installing this package as a local dependency (e.g. when cloning the parent mono-repo) does not work due to some issues with the underlying symlinks breaking the reactiveness of data passed from IndexedDB. A workaround is either to install from the NPM registery or to install it locally with the "install links" option:

```sh
npm install --install-links ../shared
```

When changes are made to the local package, the above command must be run in consuming local projects to reflect the changes after building the package with `npm run build`.
