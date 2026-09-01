# Luminary E2E Tests

End-to-end Playwright suite for the App and the CMS. This package is intentionally standalone — it is **not** part of the `app/`, `cms/`, or `shared/` build pipelines.

## Two modes

| Mode         | Opt in with                            | Auth                                                                     | Use it for                                                                               |
| ------------ | -------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **Deployed** | `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | One real UI login through the hosted provider, cached via `storageState` | Smoke-testing a real environment, and the only place the real OIDC redirect is exercised |
| **Fake IdP** | `E2E_COUCHDB_URL`                      | A local OIDC issuer; each test picks a persona                           | Permission behaviour, multi-role flows, anything needing controlled data                 |

Permissions cannot be tested meaningfully against a shared deployed environment — you control neither the data nor its reset. That is what fake-IdP mode is for. See [Fake IdP mode](#fake-idp-mode).

## What this suite covers

Two Playwright projects, each pointed at its own base URL:

| Project | Base URL env var | Auth                                             | Purpose                                                                       |
| ------- | ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `app`   | `APP_BASE_URL`   | Guest, or a persona                              | Public app behavior: home page, IndexedDB sync, navigation, content rendering |
| `cms`   | `CMS_BASE_URL`   | UI login once (deployed) or a persona (fake IdP) | Authenticated CMS behavior: content editing, publishing flows, permissions    |

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

| Name                   | Required      | Description                                                                                                                 |
| ---------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `APP_BASE_URL`         | yes           | Base URL of the deployed App (e.g. a dev/staging environment)                                                               |
| `CMS_BASE_URL`         | yes           | Base URL of the deployed CMS                                                                                                |
| `E2E_USER_EMAIL`       | deployed mode | Test user email for CMS login                                                                                               |
| `E2E_USER_PASSWORD`    | deployed mode | Test user password for CMS login                                                                                            |
| `E2E_COUCHDB_URL`      | fake-IdP mode | CouchDB of the stack under test, credentials included. Setting this switches the suite into [fake IdP mode](#fake-idp-mode) |
| `E2E_COUCHDB_DATABASE` | no            | CouchDB database name (default `luminary`)                                                                                  |
| `E2E_IDP_PORT`         | no            | Port the primary issuer binds to (default `8099`); the secondary takes the next port up                                     |
| `E2E_API_URL`          | no            | API origin, used by the preflight probe (default `http://localhost:3000`)                                                   |
| `E2E_WORKERS`          | no            | Worker count in fake-IdP mode (default 4 in CI)                                                                             |

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

## Fake IdP mode

Set `E2E_COUCHDB_URL` and global setup starts a local OIDC issuer instead of logging into a real provider. The API's token verification runs completely unmodified — real RS256 signatures, real JWKS fetch, real audience/issuer/`azp` checks, real `AutoGroupMappings` evaluation and `User`-doc linking. Only the identity provider is substituted.

```bash
# .env
APP_BASE_URL=http://localhost:4174
CMS_BASE_URL=http://localhost:4175
E2E_COUCHDB_URL=http://admin:password@localhost:5984
E2E_COUCHDB_DATABASE=luminary
E2E_IDP_PORT=8099
```

The API must be started with `AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true` — it refuses a non-https AuthProvider domain by default, because the provider's JWKS is fetched from that host and a plaintext fetch would let an on-path attacker substitute signing keys. Without the flag every persona's token is rejected as `token_invalid`.

The stack must already be running and seeded (`npm run seed` in `api/`). Global setup then:

1. Loads or creates an RS256 keypair per issuer in `.auth/idp-key-<primary|secondary>.json`.
2. Starts **two** issuers, on `E2E_IDP_PORT` and the next port up, each serving OIDC discovery, JWKS, `/authorize` (with an account-chooser page), `/oauth/token` and `/logout`. Two separate issuers rather than two clients on one, so provider scoping is exercised against genuinely different domains, keys and JWKS endpoints.
3. Writes an `AuthProvider` doc per issuer (`auth-provider-e2e`, `auth-provider-e2e-secondary`), a provider-less `AutoGroupMappings` doc granting `group-public-users` to everyone including guests, and the suite's own `user-e2e-provider-scope` User doc.
4. Records the result in `.auth/idp.json` so test workers can mint tokens.

### Signing in as a persona

```ts
import { cmsPersonaTest as test, expect } from "../../fixtures/persona";

test("editors can open the content editor", async ({ page, loginAs }) => {
  await loginAs("editor1");
  await page.goto("/");
  // …
});
```

`loginAs` mints a signed token for the persona and injects an `oidc-client-ts` session into the browser context, so the client boots straight into its authenticated path — setting the `Authorization` and `x-auth-provider-id` headers and authenticating the socket exactly as a real login does. **Call it before the first navigation**; the session is an init script and a loaded page will not pick it up.

App specs use `appPersonaTest` instead. A test that omits `loginAs` runs as a guest.

### Personas

Defined in [fixtures/idp/personas.ts](fixtures/idp/personas.ts), linked to `api/src/db/seedingDocs/` by email. Every persona also picks up `group-public-users` from the provider-less `AutoGroupMappings` default, which grants read access to public content on top of its own membership — so the boundary between an editor and a reader shows up in the _permissions_ on a group, not in whether the group appears at all:

| Persona          | Groups                   | Reaches                                                                 |
| ---------------- | ------------------------ | ----------------------------------------------------------------------- |
| `superAdmin`     | `group-super-admins`     | The admin groups — **not** the content groups                           |
| `editor1`        | public + private editors | Edit/publish in both content groups                                     |
| `editor2`        | private editors          | Edits private content only — reads public content via the default group |
| `privateUser`    | `group-private-users`    | Reads public **and** private content                                    |
| `publicUser`     | `group-public-users`     | Reads public content only                                               |
| `providerScoped` | private editors          | **Dedicated** to the provider-scoping spec — see below                  |
| `unlinked`       | —                        | Valid token, no `User` doc: default groups only                         |

`loginAs` takes the primary provider by default; pass `{ provider: "secondary" }` for the other one.

Add a persona by adding a `User` doc to the seeding docs and an entry here — no fixture changes needed.

### Signing in stamps a user, permanently

The API records the provider a `User` doc first signs in through, then excludes that doc's groups from every other provider (`authIdentity.service.ts`). It is deliberate — a token carrying the same email from an untrusted issuer must not inherit an account's permissions — but the second provider still signs in successfully, with a silently reduced access map that the server only records as a log warning.

Two consequences for specs:

- **The first sign-in mutates the seeded data.** CI gets a fresh database each run; locally, a re-run is running against already-stamped user docs.
- **An identity that signs in through more than one provider cannot be shared.** Mark such a persona `dedicated: true` so `sharedPersonas()` keeps it out of the general sweep, and reserve it to one spec. `providerScoped` and its `user-e2e-provider-scope` doc exist for exactly this; `unlinked` has no `User` doc at all, so it is provider-neutral and safe for login-flow specs.

### What to assert

Two client-side signals expose the server's real decision:

- `localStorage.accessMap` — the `AccessMap` delivered on the socket handshake, mirrored by `luminary-shared`.
- The `memberOf` of documents in the `luminary-db` IndexedDB store — anything a connection was not entitled to never arrives.

See [cms/authentication/persona-access.spec.ts](cms/authentication/persona-access.spec.ts) and [app/flows/permission-scoped-sync.spec.ts](app/flows/permission-scoped-sync.spec.ts).

### Driving the real login UI

`loginAs` skips the login UI, so a handful of specs drive it for real instead — [fixtures/loginFlow.ts](fixtures/loginFlow.ts) provides `waitForProviderChoices`, `signInThroughUI`, `signOutThroughUI` and `readActiveProviderId`. Together they cover the provider modal, the OIDC redirect, the issuer's own account chooser, the authorization-code exchange and the sign-out round trip.

These are the specs that would catch a session surviving a provider switch, or a user being bounced to a login screen unexpectedly:

| Spec                                                                                                                                                       | Covers                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [login-flow.spec.ts](cms/authentication/login-flow.spec.ts)                                                                                                | The real redirect, sign-out, and a provider A → B → A cycle                                                                                                                                                    |
| [session-persistence.spec.ts](cms/authentication/session-persistence.spec.ts)                                                                              | Reload, and an expired token refreshed silently against the issuer's token endpoint                                                                                                                            |
| [token-recovery.spec.ts](cms/authentication/token-recovery.spec.ts)                                                                                        | A token that goes stale _mid-session_: the API rejects the reconnecting socket, the client refreshes silently and reconnects — no re-login UI. Recovery is meant to be quiet, so quietness is what is asserted |
| [opaque-token-recovery.spec.ts](cms/authentication/opaque-token-recovery.spec.ts) and [auth-token-recovery.spec.ts](app/flows/auth-token-recovery.spec.ts) | An Auth0-style opaque token is rejected by the API, an opaque refresh result is not retried, and the forced visible login retains both `prompt=login` and the API `audience` before reconnecting with a JWT    |
| [provider-scoping.spec.ts](cms/authentication/provider-scoping.spec.ts)                                                                                    | The silent access-map reduction described above                                                                                                                                                                |

Keep this set small — it is far more coupled to markup than the rest of the suite. Everything that is _not_ about logging in should use `loginAs`.

The issuer's `/authorize` also accepts `login_hint=<personaKey>` to pick an identity with no page rendered, for a flow that needs the redirect but not the UI.

### Running it locally

Five processes, once:

```bash
cd api  && ./scripts/start-couchdb-in-ci.sh && ./scripts/start-minio-in-ci.sh
curl -X PUT http://admin:password@localhost:5984/luminary
cd api  && npm run seed
cd api  && AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true npm start
cd app  && npm run dev      # 4174
cd cms  && npm run dev      # 4175
```

Then `cd playwright-tests && npm test`. Global setup probes CouchDB, the API, the App and the CMS before it starts the issuer, so a missing piece fails immediately with a message naming what to start rather than as a timeout inside a spec. It also checks the database actually holds the seeded Group and User docs — an unseeded database otherwise yields empty access maps instead of an obvious error.

### Which specs run in which mode

The two fixture families guard themselves, so a full `npx playwright test` is correct in either mode:

- Persona specs skip outside fake-IdP mode (no local issuer to mint against).
- `cmsTest` specs, which depend on the shared deployed session, skip inside fake-IdP mode.
- `appTest` guest specs run in both.

## Writing efficient specs

The suite runs `fullyParallel` in fake-IdP mode — each test gets its own browser context and IndexedDB, and the persona specs only read, so they do not interfere. Against a deployed environment it stays serial, since that environment is shared with other consumers.

Two rules matter more than anything else for speed and reliability:

**Never wait on `networkidle`.** Both clients hold an open socket, so the page may never reach it. Wait on the state you actually care about instead — [fixtures/readiness.ts](fixtures/readiness.ts) provides `waitForAccessMap` and `waitForSynced`.

**Never hand `page.waitForFunction` an async predicate.** It tests the returned value for truthiness without awaiting it, and a promise is always truthy, so the wait resolves on the first poll and silently becomes a race. `waitForAccessMap` reads `localStorage` synchronously and can use it; `waitForSynced` has to read IndexedDB, so it polls from the test process instead.

**Never assert an absence first.** `expect(groups).not.toContain("group-private-content")` passes instantly against an empty database and proves nothing. Wait for something the persona _should_ receive, then assert what it should not:

```ts
const { groups } = await waitForSynced(page, {
  groups: ["group-public-content"],
});
expect(groups).not.toContain("group-private-content");
```

`waitForSynced` takes `groups` and/or `types` and returns `{ groups, types, statuses }` for whatever you want to assert next. On timeout it reports what it did see, so a failure names the gap instead of just the deadline.

**Assert permissions, not group presence.** The AccessMap is a closure over the ACL graph — `permissions.service.ts` forwards a group's access to whoever can reach it, capped at the permissions of the link it came through. So a group shows up in the map for reasons far removed from the membership you are testing, and `expect(Object.keys(accessMap)).not.toContain(...)` will surprise you. What distinguishes an editor from a reader is `edit`/`cmsView` on a group, not whether the group is listed:

```ts
expect(accessMap["group-languages"]?.language?.view).toBe(true);
expect(accessMap["group-languages"]?.language?.cmsView).toBeFalsy();
```

**Mind the viewport.** Specs run at Playwright's Desktop Chrome default of 1280×720, which is above Tailwind's `lg` breakpoint. The app's `banner` landmark lives in the mobile top bar (`lg:hidden`), so it is absent at that width — set a narrow viewport for anything asserting mobile chrome.

`loginAs` enforces its own preconditions — it throws if called after the first navigation (an init script cannot reach a loaded page) or twice in one context.

## Folder structure

Playwright discovers every `*.spec.ts` recursively under each project's `testDir`, so you are free to organize specs into whatever folders make sense. The convention for this repo is:

```
playwright-tests/
├── fixtures/                # shared test fixtures & global setup (no specs)
│   ├── global-setup.ts
│   ├── test.ts              # deployed-mode fixtures (cmsTest / appTest)
│   ├── persona.ts           # fake-IdP fixtures (cmsPersonaTest / appPersonaTest)
│   └── idp/                 # the fake OIDC issuer
│       ├── fakeIdp.ts       # discovery, JWKS, /authorize, /oauth/token
│       ├── mint.ts          # RS256 token minting (no server needed)
│       ├── signingKey.ts    # persisted keypair, shared across processes
│       ├── personas.ts      # identities mapped to api/src/db/seedingDocs
│       ├── authSession.ts   # injects an oidc-client-ts session into a context
│       └── seedProvider.ts  # writes the AuthProvider doc into CouchDB
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

Two workflows, one per mode:

### Fake IdP — [e2e-local-stack.yml](../.github/workflows/e2e-local-stack.yml)

Runs on pull requests touching `api/`, `app/`, `cms/`, `shared/` or `playwright-tests/`, and on `workflow_dispatch`. It stands the whole stack up on the runner — CouchDB, MinIO, a seeded API, and production builds of the App and CMS — then runs the suite against it. **No secrets or repo variables required**, so it works on forks and needs no deployed environment to be healthy.

Notes on why it is shaped the way it is:

- The API is started with `AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true`; without it every persona token is rejected.
- `APP_BASE_URL` / `CMS_BASE_URL` use `localhost`, not `127.0.0.1` — the API's `CORS_ORIGIN` allowlist names `localhost`, and the two are different origins to a browser.
- Clients are built with `build-only`, skipping `vue-tsc`; type checking belongs to the per-package unit-test workflows.
- Seeding runs `node dist/src/main seed` against the already-built output rather than `npm run seed`, which would compile a second time.
- npm caches key off all five lockfiles; Playwright browsers are cached separately, with `install-deps` still run on a cache hit so a fresh runner gets the system libraries.

### Deployed — [e2e-tests.yml](../.github/workflows/e2e-tests.yml)

Runs on every push to `main` and via `workflow_dispatch`, against a real environment.

Required GitHub repo configuration:

- **Secrets**: `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`
- **Variables**: `APP_BASE_URL`, `CMS_BASE_URL`

On failure it also opens (or comments on an existing) GitHub Issue labelled `e2e-failure` / `bug`, linking to the failing run.

### Artifacts

Both workflows upload to GitHub's own artifact storage, attached to the run — nothing is sent anywhere else. Get them from the run summary page, or with `gh run download <run-id>`.

| Workflow | HTML report (always)            | Traces, videos, screenshots (on failure) |
| -------- | ------------------------------- | ---------------------------------------- |
| Fake IdP | `playwright-report-local-stack` | `playwright-test-results-local-stack`    |
| Deployed | `playwright-report`             | `playwright-test-results`                |

The names are suffixed per workflow so runs of both on one commit do not collide. All four are retained 14 days, overriding the repo default, and are readable by anyone with read access to the repo.

Traces and videos from a fake-IdP run contain the minted JWTs — they sit in `localStorage` and on request headers. Each run signs with its own generated keypair, against an issuer that only ever existed on that runner, so they grant nothing afterwards; it is still the reason retention is kept short.

`e2e-local-stack.yml` also has a `Collect API log` step. That one produces no artifact: it prints the API's stdout into the step log, which is otherwise lost when the runner is torn down, and is usually where the answer is when the stack failed to come up.

## Debugging failures

```bash
npx playwright show-report                     # open the HTML report from the last run
npx playwright show-trace test-results/…/trace.zip   # open a specific trace
```

In CI, download the run's artifacts (see [Artifacts](#artifacts) for the names each workflow uses) and open them locally the same way.

## Files you should not commit

`.env`, `.auth/`, `playwright-report/`, `test-results/`, and `node_modules/` are all in the local [.gitignore](.gitignore). Keep it that way — `.auth/` in particular contains real access tokens.
