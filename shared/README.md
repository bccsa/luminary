# Luminary frontend shared library

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

## Security: npm overrides

This package uses **npm overrides** to manage security vulnerabilities in transitive dependencies. The `overrides` field in `package.json` forces specific versions of packages throughout the dependency tree.

### Current overrides:

- **lodash** → `^4.17.23` - Fixes prototype pollution vulnerability ([GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg))
- **glob** → `^11.1.0` - Fixes command injection vulnerability ([GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2))
- **js-yaml** → `^4.1.1` - Fixes prototype pollution vulnerability ([GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m))
- **esbuild** → `^0.25.0` - Fixes CORS vulnerability ([GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99))
- **form-data** → `^4.0.4` - Fixes unsafe random function vulnerability ([GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4))
- **qs** → `^6.14.1` - Fixes DoS vulnerability ([GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p))
- **brace-expansion** → `^2.0.2` - Fixes ReDoS vulnerability ([GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw))
- **validator** → `^13.15.22` - Fixes validation bypass vulnerability ([GHSA-vghf-hv5q-vc2g](https://github.com/advisories/GHSA-vghf-hv5q-vc2g))

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
