# Luminary CMS

This is the backend CMS for Luminary, an offline-first Vue app that communicates with the API.

## S3 Multi-Bucket Storage

The CMS supports connecting to multiple S3-compatible storage buckets for flexible content organization. You can configure different buckets for images, media, and other content types, each with their own credentials and settings.

📖 **[Complete S3 Multi-Bucket Guide](../docs/features/s3-multi-bucket/README.md)**

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
