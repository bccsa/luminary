# Luminary CMS

This is the backend CMS for Luminary, an offline-first Vue app that communicates with the API.

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
│   │   ├── BasePage.vue          # Base page component
│   │   ├── BleedHorizontal.vue   # Layout component for full-width sections
│   │   ├── EmptyState.vue        # Empty state component
│   │   ├── LoadingBar.vue        # Loading bar component
│   │   ├── LoadingSpinner.vue    # Loading spinner component
│   │   ├── OnlineIndicator.vue   # Online/offline status indicator
│   │   ├── button/               # Button components
│   │   ├── common/               # Shared common components
│   │   ├── content/              # Content management components
│   │   ├── editor/               # Rich text editor components
│   │   ├── forms/                # Form components
│   │   ├── groups/               # Group management components
│   │   ├── images/               # Image components
│   │   ├── languages/            # Language/translation components
│   │   ├── modals/               # Modal dialog components
│   │   ├── navigation/           # Navigation components
│   │   ├── notifications/        # Notification components
│   │   ├── redirects/            # Redirect management components
│   │   └── users/                # User management components
│   ├── composables/              # Vue composables (reusable composition logic)
│   ├── pages/                    # Page-level components
│   │   ├── DashboardPage.vue
│   │   ├── NotFoundPage.vue
│   │   ├── SettingsPage.vue
│   │   └── internal/             # Internal pages
│   ├── router/                   # Vue Router configuration
│   ├── stores/                   # Pinia state management stores
│   │   └── notification.ts
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

Refer to the [setup guide](../docs/setup-vue-app.md).

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
