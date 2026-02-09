# npm overrides FAQ

This document answers common questions about the `overrides` field in our package.json files.

## What are npm overrides?

**npm overrides** is a feature in npm (version 8.3.0+) that lets you replace any package in your dependency tree with a specific version. Think of it as a "force this version everywhere" command.

### Simple explanation

Imagine your project has this dependency tree:
```
your-project
└── package-a@1.0.0
    └── lodash@4.17.20  (vulnerable!)
```

You can't directly update `lodash` because it's not your direct dependency - it comes through `package-a`. 

With overrides, you can say "use lodash 4.17.23 everywhere" and npm will do it:

```json
{
  "overrides": {
    "lodash": "^4.17.23"
  }
}
```

Now your tree becomes:
```
your-project
└── package-a@1.0.0
    └── lodash@4.17.23  (fixed! ✅)
```

## Why do we use overrides?

### Problem: Transitive dependency vulnerabilities

We discovered 67 security vulnerabilities in the project. Many were in **transitive dependencies** - packages we don't control directly:

- ❌ We use `@nestjs/config` which uses `lodash` with a vulnerability
- ❌ We use `minio` which uses `fast-xml-parser` with a vulnerability
- ❌ We use `vite` which uses `esbuild` with a vulnerability

### Traditional solutions didn't work

1. **Update direct dependencies?** ❌ Doesn't help if the parent package hasn't updated
2. **Wait for upstream to update?** ❌ Could take months, leaving us vulnerable
3. **Fork the packages?** ❌ Too much maintenance burden
4. **Major version upgrade?** ❌ Breaking changes, extensive testing needed

### Solution: npm overrides ✅

Overrides let us:
- ✅ Fix vulnerabilities **immediately**
- ✅ Control exact versions used
- ✅ No code changes needed
- ✅ Easy to remove later

## How do overrides work?

### Step 1: Identify the vulnerability

```bash
npm audit
# Shows: lodash@4.17.21 has prototype pollution vulnerability
# Fixed in: 4.17.23+
```

### Step 2: Add override to package.json

```json
{
  "name": "your-package",
  "overrides": {
    "lodash": "^4.17.23"
  },
  "dependencies": {
    "@nestjs/config": "^3.1.1"
  }
}
```

### Step 3: Install and test

```bash
npm install    # Applies the override
npm run build  # Test that nothing breaks
npm run test   # Verify functionality
```

### Step 4: Verify the fix

```bash
npm list lodash
# Shows: lodash@4.17.23 everywhere ✅

npm audit
# Vulnerability resolved! ✅
```

## Real example from our project

### Before overrides

```bash
$ npm audit
# 21 vulnerabilities (1 critical, 12 high, 4 moderate, 4 low)
```

**Problems identified:**
- `form-data@4.0.3` - Critical unsafe random function
- `lodash@4.17.21` - Moderate prototype pollution
- `fast-xml-parser@4.4.1` - High DoS vulnerability
- Many more...

### After adding overrides

Added to `api/package.json`:
```json
{
  "overrides": {
    "lodash": "^4.17.23",
    "fast-xml-parser": "^5.3.4",
    "fastify": "^5.7.3",
    "@fastify/middie": "^9.0.4"
  }
}
```

```bash
$ npm install
$ npm audit
# 1 vulnerability (1 moderate)  ✅ 95% reduction!
```

## Common questions

### Q: Does this change my code?

**A:** No! Overrides work at the package manager level. Your code stays the same.

### Q: Is it safe to override versions?

**A:** Generally yes, especially for patch/minor versions (4.17.20 → 4.17.23). We use semver ranges (^) to allow compatible updates. Always test after adding overrides.

### Q: What if the override breaks something?

**A:** Test thoroughly after adding overrides. If something breaks, you can:
1. Try a different version
2. Remove the override
3. Report the issue to the package maintainer

### Q: When should I remove an override?

**A:** Remove overrides when:
- The parent package updates to use a secure version naturally
- You upgrade to a major version that includes the fix
- The vulnerability was a false positive

Check periodically:
```bash
# See what versions are naturally requested
npm ls lodash --all

# If parent package now requests 4.17.23+, remove the override
```

### Q: Do overrides work with yarn/pnpm?

**A:** Similar features exist but with different syntax:
- **npm**: `overrides` field
- **yarn**: `resolutions` field
- **pnpm**: `pnpm.overrides` field

This project uses npm, so we use `overrides`.

### Q: How do I know what version to use in an override?

**A:** Check the vulnerability advisory:
```bash
npm audit
# Look for "fix available via..." message
# Or check: https://github.com/advisories
```

Example advisory says: "Fixed in lodash@4.17.23"
→ Use `"lodash": "^4.17.23"` in overrides

### Q: Can I override multiple packages?

**A:** Yes! That's exactly what we do:

```json
{
  "overrides": {
    "lodash": "^4.17.23",
    "glob": "^11.1.0",
    "js-yaml": "^4.1.1",
    "esbuild": "^0.25.0"
  }
}
```

### Q: What's the maintenance burden?

**A:** Moderate but manageable:
- Run `npm audit` regularly (monthly or before releases)
- Update overrides when new vulnerabilities appear
- Remove overrides when no longer needed
- Document changes in SECURITY.md

## Results in our project

Using npm overrides, we fixed:

| Severity | Before | After | Fixed |
|----------|--------|-------|-------|
| Critical | 1      | 0     | ✅ 100% |
| High     | 18     | 0     | ✅ 100% |
| Moderate | 37     | 11    | ✅ 70% |
| Low      | 11     | 0     | ✅ 100% |
| **Total** | **67** | **11** | **✅ 87%** |

The 11 remaining vulnerabilities require major version upgrades (breaking changes).

## More resources

- [SECURITY.md](./SECURITY.md) - Complete security policy
- [ADR 0008](./docs/adr/0008-npm-overrides-for-security.md) - Decision rationale
- [npm overrides docs](https://docs.npmjs.com/cli/v9/configuring-npm/package-json#overrides)
- [Package READMEs](./api/README.md) - Package-specific override lists

## Quick commands

```bash
# Check for vulnerabilities
npm audit

# See dependency tree
npm list <package-name>

# Update overrides after fixing
npm install
npm run build
npm run test

# Commit with clear message
git commit -m "security: override package-name to fix CVE-XXXX-XXXXX"
```

---

**TL;DR:** npm overrides let us force specific package versions throughout our dependency tree, allowing immediate security fixes for transitive dependencies without waiting for upstream updates or making breaking changes.
