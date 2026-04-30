# Luminary E2E Tests

End-to-end Playwright suite that runs against deployed Luminary environments (the App and the CMS). This package is intentionally standalone — it is **not** part of the `app/`, `cms/`, or `shared/` build pipelines, and it does not spin up local services. Every run hits a real, already-deployed environment.

## What this suite covers

Two Playwright projects, each pointed at its own base URL:

| Project | Base URL env var | Auth | Purpose |
| ------- | ---------------- | ---- | ------- |
| `app`   | `APP_BASE_URL`   | Guest (no login) | Public app behavior: home page, IndexedDB sync, navigation, content rendering |
| `cms`   | `CMS_BASE_URL`   | UI login once, cached via `storageState` + IndexedDB | Authenticated CMS behavior: content editing, publishing flows, permissions |

Both projects are discovered and executed by a single `npx playwright test` invocation.

## Requirements

- Node.js (version pinned in [.node-version](.node-version))
- A dedicated test user provisioned on the auth provider backing the CMS environment, with the permissions the CMS tests need

## First-time setup

```bash
cd playwright-tests
npm install
npx playwright install chromium
cp .env.example .env
# fill in APP_BASE_URL, CMS_BASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD
```

### Environment variables

| Name | Required | Description |
| ---- | -------- | ----------- |
| `APP_BASE_URL` | yes | Base URL of the deployed App (e.g. a dev/staging environment) |
| `CMS_BASE_URL` | yes | Base URL of the deployed CMS |
| `E2E_USER_EMAIL` | yes | Test user email for CMS login |
| `E2E_USER_PASSWORD` | yes | Test user password for CMS login |
| `E2E_USER_2_EMAIL` | optional | Second test user email — required for the multi-user authorization specs in `cms/authentication/group-authz.spec.ts`. Provision with a different group membership than user 1. |
| `E2E_USER_2_PASSWORD` | optional | Password for the second test user. Specs that need user 2 will skip cleanly when this is unset. |

No URLs are hard-coded anywhere in this package. If `APP_BASE_URL` / `CMS_BASE_URL` are missing, the suite refuses to start.

## Running tests

```bash
npm test                  # run everything
npm run test:app          # only the App project
npm run test:cms          # only the CMS project

npm run test:ui           # Playwright UI mode (recommended while authoring)
npm run test:headed       # run with a visible browser
npm run test:debug        # step through with the Playwright Inspector

npm run test:app:ui       # UI mode, scoped to one project
npm run test:cms:ui
npm run test:app:headed
npm run test:cms:headed

npm run report            # open the last HTML report
```

### Authoring new tests with codegen

```bash
npm run codegen:app       # opens playwright codegen against $APP_BASE_URL
npm run codegen:cms       # opens playwright codegen against $CMS_BASE_URL
```

Codegen bypasses the test runner (and global setup), so use it to explore the UI and capture selectors before wiring them into a spec.

## Authentication flow

The CMS requires a real authenticated session. This is handled once per run in [fixtures/global-setup.ts](fixtures/global-setup.ts):

1. Navigate to `CMS_BASE_URL`.
2. Click the "BCC Africa Guest" provider button on the CMS sign-in screen.
3. Follow the redirect to the hosted auth provider and fill in `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` across the two-step login form.
4. Wait for the return redirect and verify the CMS sign-in screen is gone (otherwise fail fast).
5. Persist the authenticated state:
   - `.auth/cms.json` — cookies, `localStorage`, and **IndexedDB** (via `storageState({ indexedDB: true })`, Playwright 1.51+). This is where the auth provider stashes its tokens.
   - `.auth/cms-session.json` — `sessionStorage` dump, since Playwright's `storageState()` does not capture it. Re-seeded into each new page via `context.addInitScript` in [fixtures/test.ts](fixtures/test.ts).

The App project doesn't need any of this — it stores an empty guest `storageState` (`.auth/app.json`) because the App allows unauthenticated browsing.

Writing a CMS spec? Import from the shared fixture so the sessionStorage shim is applied:

```ts
import { cmsTest as test, expect } from "../../fixtures/test";
```

Writing an App spec?

```ts
import { appTest as test, expect } from "../../fixtures/test";
```

Both fixtures also capture `API warning received:` console warnings from `syncBatch.ts` and fail the test if any are emitted — these indicate CouchDB queries running without a valid index.

## Folder structure

Playwright discovers every `*.spec.ts` recursively under each project's `testDir`, so you are free to organize specs into whatever folders make sense. The convention for this repo is:

```
playwright-tests/
├── fixtures/                # shared test fixtures & global setup (no specs)
│   ├── global-setup.ts
│   └── test.ts
├── app/                     # testDir for the "app" Playwright project
│   ├── pages/               # per-route / per-page tests (home, explore, watch, content, …)
│   │   └── home-page.spec.ts
│   ├── components/          # cross-page UI components (header, profile menu, language switcher, …)
│   └── flows/               # optional: multi-page user journeys (e.g. "switch language then read a post")
└── cms/                     # testDir for the "cms" Playwright project
    ├── authentication/      # sign-in, sign-out, session handling
    │   └── authenticated-access.spec.ts
    ├── pages/               # per-route CMS screens (dashboard, content list, editor, settings, …)
    ├── components/          # cross-page CMS components (sidebar, top bar, modals, …)
    └── flows/               # optional: end-to-end editorial journeys (draft → publish → verify in App)
```

### Folder guidelines

- **`pages/`** — one spec per route. Name the file after the route (`home-page.spec.ts`, `content-editor.spec.ts`). Tests here should assert page-level behavior: loads, correct headings, primary controls render, data from the backend shows up.
- **`components/`** — tests for UI pieces that appear on multiple pages (header, sidebar, modals, pickers). Name the file after the component (`profile-menu.spec.ts`, `language-switcher.spec.ts`). Start each test by navigating to a page where the component renders.
- **`flows/`** — multi-step user journeys that cross pages or cross App↔CMS boundaries. Name the file after the journey (`draft-to-published.spec.ts`, `add-preferred-language.spec.ts`). Use sparingly — these are slower and more brittle than page/component tests.
- **`authentication/`** (CMS only) — tests that specifically exercise the login/logout path. Most other CMS tests should assume the user is already authenticated via global setup.
- **No specs at the top level of `app/` or `cms/`** — always drop new specs into one of the subfolders above so intent is obvious. Nesting deeper is fine when a section has many related specs (e.g. `cms/pages/content/editor.spec.ts`).
- **One `describe` per spec file** — the describe title should match the folder + filename (e.g. `describe("App home page", ...)` in `app/pages/home-page.spec.ts`). Keep tests inside a file focused on a single page/component/flow.

### Naming

- Files: `kebab-case.spec.ts`
- Describes: human-readable ("CMS content editor", "App language switcher")
- Tests: start with a verb, describe observable behavior ("opens the editor from the sidebar", "saves a draft and shows a confirmation toast")

## CI

Tests run on every push to `main` via [.github/workflows/e2e-tests.yml](../.github/workflows/e2e-tests.yml), and can be kicked off manually via `workflow_dispatch`.

Required GitHub repo configuration:

- **Secrets**: `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, and (optional, for group-authz specs) `E2E_USER_2_EMAIL`, `E2E_USER_2_PASSWORD`
- **Variables**: `APP_BASE_URL`, `CMS_BASE_URL`

On failure the workflow:

1. Uploads the `playwright-report/` HTML report and `test-results/` (traces, videos, screenshots) as artifacts (retained 14 days).
2. Opens (or comments on an existing) GitHub Issue labelled `e2e-failure` / `bug`, linking to the failing run.

## Debugging failures

```bash
npx playwright show-report                     # open the HTML report from the last run
npx playwright show-trace test-results/…/trace.zip   # open a specific trace
```

In CI, download the `playwright-report` and `playwright-test-results` artifacts from the failing run and open them locally the same way.

## Files you should not commit

`.env`, `.auth/`, `playwright-report/`, `test-results/`, and `node_modules/` are all in the local [.gitignore](.gitignore). Keep it that way — `.auth/` in particular contains real access tokens.
