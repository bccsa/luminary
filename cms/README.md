# Luminary CMS

This is the backend CMS for Luminary, an offline-first Vue app that communicates with the API.

## S3 Multi-Bucket Storage

The CMS supports connecting to multiple S3-compatible storage buckets for flexible content organization. You can configure different buckets for images, media, and other content types, each with their own credentials and settings.

📖 **[Complete S3 Multi-Bucket Guide](../api/docs/s3-multi-bucket/README.md)**

## Project Structure

> **Note:** We are currently migrating to a new component organization structure where each feature folder will contain a `__tests__` subdirectory alongside its related components. For example:
>
> ```
> pages/ComponentFolder/
> ├── __tests__/
> └── [related components]
> ```

```
cms/
├── public/                       # Static assets
├── scripts/                      # Build and deployment scripts
│   └── setup-nginxvars.sh
├── src/
│   ├── assets/                   # Images, styles, and static resources
│   ├── components/               # Vue components
│   ├── composables/              # Vue composables (reusable composition logic)
│   ├── pages/                    # Page-level components
│   │   └── internal/             # Internal pages
│   ├── router/                   # Vue Router configuration
│   ├── stores/                   # Pinia state management stores
│   ├── tests/                    # Test utilities and helpers
│   ├── util/                     # Utility functions
│   ├── auth.ts                   # Authentication logic
│   ├── globalConfig.ts           # Global configuration
│   ├── main.ts                   # Application entry point
│   └── App.vue                   # Root Vue component
├── Dockerfile                    # Docker configuration for production
├── nginx.conf                    # Nginx configuration for production
├── index.html                    # HTML entry point
├── package.json                  # Dependencies and scripts
├── postcss.config.js             # PostCSS configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── tsconfig.json                 # TypeScript configuration (base)
├── tsconfig.app.json             # TypeScript configuration (app)
├── tsconfig.node.json            # TypeScript configuration (Node)
├── tsconfig.vitest.json          # TypeScript configuration (Vitest)
├── vite.config.ts                # Vite build configuration
├── vitest.config.ts              # Vitest test configuration
└── vitest.setup.ts               # Vitest test setup
```

## Local setup

Refer to the [setup guide](../docs/guides/setup-vue-app.md).

When running `npm run dev` the local reloading server of the app will start at http://localhost:4175.

## Build for production

The CMS can be deployed as a Docker container by building the `Dockerfile`:

```sh
docker build -t luminary-cms .
docker run --rm -it -p 8080:80 luminary-cms
```

`gzip` functionality is enabled by default, disable it as shown:
**Available as a docker .env parameter**

```sh
docker run -e ENABLE_GZIP=false --rm -it -p 8080:80 luminary-cms
```

This will run the CMS on port 8080 on the host machine.

### Update-detection cache TTL (CDN tuneable)

The in-app update banner ([`usePwaUpdate.ts`](src/composables/usePwaUpdate.ts)) polls `/version.json` every 5 seconds and compares it to the build ID baked into the running bundle. `nginx.conf` sends `Cache-Control: no-cache, s-maxage=60` for this file: browsers must always revalidate (TTL 0), while a shared/CDN cache may serve it from cache for up to 60 seconds (TTL 60) to absorb that polling load without meaningfully delaying update detection.

**If you deploy behind a CDN, verify it honours `s-maxage`** — some CDNs ignore it, or only cache recognised static extensions and skip a bare `/version.json` by default, or need an explicit cache/rewrite rule to apply a short TTL to this path instead. Keep the TTL small (order of a minute) so deployed clients still pick up new builds promptly.

To check whether the CDN is actually honouring the TTL, request `/version.json` through the CDN (not the origin) a few times in a row and inspect the response headers:

```sh
curl -sD - -o /dev/null https://<your-cdn-domain>/version.json
```

- Look for a cache-status header (`Age`, `X-Cache`, `CF-Cache-Status`, `X-Amz-Cf-Id`, etc. depending on vendor). `Age` should climb from `0` toward `60` and then reset; `X-Cache`/`CF-Cache-Status` should show `HIT` between origin fetches.
- If every request comes back `MISS`/`Age: 0`, or the `Cache-Control` header is missing/rewritten, the CDN isn't respecting `s-maxage` and needs an explicit path rule for `/version.json` (e.g. Cloudflare Cache Rules, a CloudFront cache behavior, or a Fastly VCL snippet) forcing an edge TTL of ~60s.

## Testing

### Unit Tests

Run unit tests with Vitest:

```sh
npm run test:unit
```

### E2E Tests

The CMS uses Playwright for end-to-end testing. E2E tests run in **auth bypass mode**, which allows testing without requiring Auth0 integration.

#### Running E2E Tests

```sh
# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests
npm run test:e2e

# Run with UI mode for debugging
npx playwright test --ui

# Generate test code
npm run test:e2e:codegen
```

#### Auth Bypass Mode

For E2E testing and local development without Auth0, set `VITE_AUTH_BYPASS=true` in your environment:

```sh
# Add to your .env file for local development:
VITE_AUTH_BYPASS=true
```

When auth bypass is enabled:

- The application skips Auth0 authentication entirely
- A mock user (`E2E Test User`) is automatically "logged in"
- All authenticated routes are accessible
- ⚠️ **Never enable this in production!**
