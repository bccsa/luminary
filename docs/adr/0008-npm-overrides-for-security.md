# 8. Use npm overrides for security vulnerability management

Date: 2026-02-09

## Status

Accepted

## Context

During a security audit of the project dependencies, we identified 67 security vulnerabilities across all four packages (api, app, cms, shared):
- 1 critical vulnerability
- 18 high severity vulnerabilities
- 37 moderate severity vulnerabilities
- 11 low severity vulnerabilities

Many of these vulnerabilities existed in **transitive dependencies** (dependencies of our dependencies) that we don't directly control. For example:
- `lodash` was vulnerable to prototype pollution but was only used transitively through `@nestjs/config`
- `fast-xml-parser` had a DoS vulnerability but came through the `minio` package
- `glob`, `js-yaml`, `esbuild`, and many others had vulnerabilities deep in the dependency tree

Simply updating our direct dependencies didn't always resolve these issues because:
1. The parent packages hadn't updated to use secure versions yet
2. Some packages required major version upgrades (breaking changes) to fix
3. We couldn't control transitive dependency versions without a mechanism to override them

## Decision

We will use **npm overrides** in all `package.json` files to force the use of secure versions of transitive dependencies.

### What are npm overrides?

The `overrides` field in `package.json` (available in npm 8.3.0+) allows you to replace a package in your dependency tree with a specific version, regardless of what version the parent package specifies. This gives us fine-grained control over transitive dependencies.

Example from our API package:
```json
{
  "name": "luminary-api",
  "overrides": {
    "lodash": "^4.17.23",
    "fast-xml-parser": "^5.3.4",
    "fastify": "^5.7.3",
    "@fastify/middie": "^9.0.4"
  }
}
```

This ensures that anywhere `lodash` is used in the dependency tree (even 10 levels deep), npm will use version `^4.17.23` instead of whatever version a package might request.

### Overrides applied

**API package:**
- `lodash: ^4.17.23` - Fixes prototype pollution vulnerability
- `fast-xml-parser: ^5.3.4` - Fixes DoS vulnerability
- `fastify: ^5.7.3` - Fixes DoS and content-type bypass
- `@fastify/middie: ^9.0.4` - Fixes path bypass vulnerability

**App package:**
- `lodash: ^4.17.23` - Fixes prototype pollution vulnerability
- `glob: ^11.1.0` - Fixes command injection vulnerability
- `js-yaml: ^4.1.1` - Fixes prototype pollution vulnerability
- `esbuild: ^0.25.0` - Fixes CORS vulnerability
- `min-document: ^2.19.2` - Fixes prototype pollution vulnerability

**Shared package:**
- `lodash: ^4.17.23` - Fixes prototype pollution vulnerability
- `glob: ^11.1.0` - Fixes command injection vulnerability
- `js-yaml: ^4.1.1` - Fixes prototype pollution vulnerability
- `esbuild: ^0.25.0` - Fixes CORS vulnerability
- `form-data: ^4.0.4` - Fixes unsafe random function vulnerability
- `qs: ^6.14.1` - Fixes DoS vulnerability
- `brace-expansion: ^2.0.2` - Fixes ReDoS vulnerability
- `validator: ^13.15.22` - Fixes validation bypass vulnerability

**CMS package:**
- `lodash: ^4.17.23` - Fixes prototype pollution vulnerability
- `glob: ^11.1.0` - Fixes command injection vulnerability
- `js-yaml: ^4.1.1` - Fixes prototype pollution vulnerability
- `esbuild: ^0.25.0` - Fixes CORS vulnerability
- `form-data: ^4.0.4` - Fixes unsafe random function vulnerability
- `qs: ^6.14.1` - Fixes DoS vulnerability
- `brace-expansion: ^2.0.2` - Fixes ReDoS vulnerability
- `linkifyjs: ^4.3.2` - Fixes XSS and prototype pollution vulnerabilities

### Results

Using npm overrides, we successfully resolved:
- **87% of all vulnerabilities** (56 out of 67)
- **100% of critical vulnerabilities** (1/1)
- **100% of high severity vulnerabilities** (18/18)
- **79% of moderate/low vulnerabilities** (37/48)

The remaining 11 moderate vulnerabilities require major version upgrades (NestJS v10→v11, vue-tsc v1→v3) that could introduce breaking changes and should be addressed separately with thorough testing.

## Consequences

### Positive

1. **Immediate security improvements**: We can quickly patch transitive dependency vulnerabilities without waiting for upstream packages to update
2. **Granular control**: We control exactly which versions are used throughout the dependency tree
3. **No code changes required**: Overrides work at the package manager level, requiring no application code changes
4. **Reversible**: Overrides can be easily removed if they cause issues

### Negative

1. **Maintenance burden**: We must monitor and update overrides as new vulnerabilities are discovered
2. **Potential compatibility issues**: Forcing a newer version might cause compatibility issues with parent packages (though semantic versioning helps mitigate this)
3. **Hidden from parent packages**: Parent packages don't know about the override and might assume they're using an older version
4. **npm-specific**: This feature is specific to npm and doesn't work with other package managers (yarn, pnpm) without different syntax

### Maintenance guidelines

1. **Regular audits**: Run `npm audit` regularly to check for new vulnerabilities
2. **Test after updates**: Always test the application after adding or updating overrides
3. **Document each override**: When adding an override, document which vulnerability it fixes
4. **Remove when possible**: If a parent package updates to use a secure version, remove the override to reduce maintenance
5. **Monitor compatibility**: Watch for issues caused by version mismatches between overrides and parent expectations

### Alternative considered

We considered upgrading all packages to their latest major versions, but this would:
- Require significant code changes (breaking changes)
- Need extensive testing across all four packages
- Risk introducing new bugs
- Take considerably more time

Using overrides allows us to fix critical security issues immediately while planning major upgrades separately.

## References

- [npm overrides documentation](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides)
- [GitHub Advisory Database](https://github.com/advisories)
- Security fix commit: Fix majority of security vulnerabilities using npm overrides and targeted updates
