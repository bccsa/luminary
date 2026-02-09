# Security Policy

## Dependency Security Management

This project uses **npm overrides** to manage security vulnerabilities in transitive dependencies. This approach allows us to quickly patch security issues without waiting for upstream packages to update.

### What are npm overrides?

The `overrides` field in `package.json` forces npm to use specific versions of packages throughout the entire dependency tree, regardless of what versions parent packages request.

**Example:**
```json
{
  "name": "luminary-api",
  "overrides": {
    "lodash": "^4.17.23"
  }
}
```

This ensures that version `^4.17.23` of `lodash` is used everywhere in the dependency tree, even if a nested package requests an older, vulnerable version.

### Why we use overrides

Many security vulnerabilities exist in **transitive dependencies** (dependencies of our dependencies) that we don't directly control. Using overrides allows us to:

1. ✅ Fix critical vulnerabilities immediately
2. ✅ Maintain control over the exact versions used
3. ✅ Avoid waiting for upstream packages to update
4. ✅ Apply security patches without breaking code changes

### Current overrides

Each package in this monorepo has its own overrides. Here's what we're currently overriding:

#### API (`api/package.json`)
- **lodash** → `^4.17.23` - Fixes prototype pollution
- **fast-xml-parser** → `^5.3.4` - Fixes DoS vulnerability
- **fastify** → `^5.7.3` - Fixes DoS and bypass vulnerabilities
- **@fastify/middie** → `^9.0.4` - Fixes path bypass

#### App (`app/package.json`)
- **lodash** → `^4.17.23` - Fixes prototype pollution
- **glob** → `^11.1.0` - Fixes command injection
- **js-yaml** → `^4.1.1` - Fixes prototype pollution
- **esbuild** → `^0.25.0` - Fixes CORS vulnerability
- **min-document** → `^2.19.2` - Fixes prototype pollution

#### Shared (`shared/package.json`)
- **lodash** → `^4.17.23` - Fixes prototype pollution
- **glob** → `^11.1.0` - Fixes command injection
- **js-yaml** → `^4.1.1` - Fixes prototype pollution
- **esbuild** → `^0.25.0` - Fixes CORS vulnerability
- **form-data** → `^4.0.4` - Fixes unsafe random function
- **qs** → `^6.14.1` - Fixes DoS vulnerability
- **brace-expansion** → `^2.0.2` - Fixes ReDoS vulnerability
- **validator** → `^13.15.22` - Fixes validation bypass

#### CMS (`cms/package.json`)
- **lodash** → `^4.17.23` - Fixes prototype pollution
- **glob** → `^11.1.0` - Fixes command injection
- **js-yaml** → `^4.1.1` - Fixes prototype pollution
- **esbuild** → `^0.25.0` - Fixes CORS vulnerability
- **form-data** → `^4.0.4` - Fixes unsafe random function
- **qs** → `^6.14.1` - Fixes DoS vulnerability
- **brace-expansion** → `^2.0.2` - Fixes ReDoS vulnerability
- **linkifyjs** → `^4.3.2` - Fixes XSS and prototype pollution

### Results

Using npm overrides, we resolved **87% of all vulnerabilities**:
- ✅ **100%** of critical vulnerabilities (1/1)
- ✅ **100%** of high severity vulnerabilities (18/18)
- ✅ **79%** of moderate/low vulnerabilities (37/48)

The remaining 11 moderate vulnerabilities require major version upgrades that could introduce breaking changes.

## Reporting a Vulnerability

If you discover a security vulnerability in this project:

1. **DO NOT** create a public GitHub issue
2. Contact the maintainers privately through GitHub Security Advisories or email
3. Provide detailed information about the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Auditing

### Regular checks

Run security audits regularly in each package:

```bash
# Check all packages
cd api && npm audit
cd ../app && npm audit
cd ../shared && npm audit
cd ../cms && npm audit
```

### Understanding the output

- **Critical/High**: Should be fixed immediately
- **Moderate**: Should be addressed in the next sprint
- **Low**: Can be scheduled for future releases

### Updating overrides

When a new vulnerability is found:

1. Check if it's in a transitive dependency
2. Find the fixed version (check npm advisory or GitHub Advisory Database)
3. Add or update the override in the relevant `package.json`
4. Run `npm install` to apply the override
5. Test the application thoroughly
6. Update this SECURITY.md file with the new override
7. Commit with a clear message explaining the security fix

**Example:**
```bash
cd api
# Add or update override in package.json
npm install
npm run build
npm run test
git add package.json package-lock.json
git commit -m "security: override vulnerable-package to fix CVE-XXXX-XXXXX"
```

## Maintenance

### When to remove overrides

Remove an override when:
1. The parent package updates to use the secure version naturally
2. The override is no longer needed (vulnerability was incorrectly reported)
3. A major version upgrade makes the override obsolete

### Monitoring

- Run `npm audit` before each release
- Review Dependabot alerts when they appear
- Check GitHub Security Advisories regularly
- Update overrides proactively, not just reactively

## Additional Resources

- [npm overrides FAQ](./docs/npm-overrides-faq.md) - **Start here!** Simple explanations and examples
- [ADR 0008: npm overrides for security](./docs/adr/0008-npm-overrides-for-security.md) - Detailed decision record
- [npm overrides documentation](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides)
- [GitHub Advisory Database](https://github.com/advisories)
- [npm audit documentation](https://docs.npmjs.com/cli/v9/commands/npm-audit)

## Security Update History

| Date | Package | Action | Reason |
|------|---------|--------|--------|
| 2026-02-06 | All | Added initial overrides | Fixed 56 of 67 vulnerabilities |

---

**Last Updated:** 2026-02-09
