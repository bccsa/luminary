# Guest auth on Ory Kratos — UI design

Working doc for the app-side login screens. The screens themselves are real components in
`app/src/components/auth/kratos/`; run `npm run dev` in `app/` and open `/design/auth` to
see all 21 of them, light and dark, side by side.

## What "guest" means

Kratos has no anonymous identity, and it should not be made to grow one. A guest here is
simply **a visitor with no Kratos session**. The API already handles that case: an
unauthenticated request resolves through `AuthIdentityService.resolveOrDefault`, which
returns `status: "anonymous"` with the groups from provider-less `AutoGroupMappings`. Guest
browsing needs no new server work at all.

What Kratos adds is a way for a guest to _stop_ being one without leaving the app: email
plus a one-time code, no password to invent, no third-party account required.

Two consequences the design is built around:

- **"Continue without an account" is a dismissal, not a sign-in method.** It is a text link
  under the card, never a third button in the method list. `screens.spec.ts` pins that.
- **Signing in moves nothing.** Bookmarks and progress live in this device's IndexedDB. The
  guest→account screen says what will travel with the account rather than implying a
  server-side merge that does not exist yet. If per-user bookmark sync lands later, that
  screen is where the merge is announced — the copy is already shaped for it.

If identified guests are ever a real requirement (device-scoped identity now, claim it from
another device later), the alternative is a credential-less `guest` identity schema created
through the Kratos admin API from the Luminary API. It costs an identity row per device,
gives no way to authenticate _back_ into that identity, and puts every one of those rows
inside the GDPR deletion story. Not worth it without a concrete need.

## Where the pages live — recommendation

**Put them in the PWA as routes** (`/login`, `/verify`, `/recovery`, `/account`), and point
Kratos's `selfservice.flows.*.ui_url` at them. Not a standalone self-service UI.

Reasons, in the order they matter here:

1. **Translations.** Every user-facing string in this app comes from synced language docs
   through `vue-i18n`. A standalone UI cannot reach them, so the most-seen screens in the
   product would need a second translation pipeline. Screens in the app use the same `t()`
   as everything else.
2. **The installed PWA.** Redirecting to another origin drops the user out of the installed
   shell — on iOS standalone mode, into a separate browser context, which is exactly where
   session cookies go missing.
3. **One design system.** `LButton`, dark mode, Inter, the zinc/slate palette all already
   exist here. Matching them twice is a standing tax.

The cost is that we render `ui.nodes` ourselves. That is bounded: known node groups
(`code`, `oidc`, `profile`) get the bespoke components in this branch, and anything
unrecognised falls through to a generic node renderer so a Kratos upgrade that adds a method
degrades to a plain form instead of a blank screen.

What choosing this requires:

- **Kratos public API must be same-site with the app.** Reverse-proxy it under the app's own
  origin (`https://app.example.com/.ory/*` → Kratos public). This is Ory's own recommended
  setup and it makes the session cookie and the CSRF cookie work without any `SameSite`
  or CORS argument.
- **Submit the `csrf_token` node.** Every flow's `ui.nodes` carries it; build the POST body
  from the nodes rather than hand-rolling fields, or the flow 403s.
- **Handle flow expiry.** Kratos flows expire (30 min by default, code flows sooner). That
  is the `Flow expired` artboard — it restarts the flow rather than showing a raw error.
- **Allowlist `return_to`** in the Kratos config, so a guest gated on a page comes back to
  that page rather than to the home screen.

## Screens ↔ Kratos flows

| Screen (artboard)                      | Flow                                 | Notes                                                                       |
| -------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| First run — sign in or look around     | none                                 | App's own decision, before any flow starts                                  |
| Guest hits a gated action              | none                                 | Inline prompt, in place; not a modal over the content                       |
| Guest → account                        | `registration/browser`               | Names what travels with the account                                         |
| Choose a method                        | `login/browser`                      | `ui.nodes` groups `code` + `oidc`                                           |
| Choose a method — email only           | `login/browser`                      | Same screen with no `oidc` group configured                                 |
| Identifier step                        | POST `ui.action`, `method=code`      |                                                                             |
| Identifier step — invalid address      | —                                    | `ui.nodes[identifier].messages`                                             |
| Code step                              | POST `ui.action`                     | `code` node + `resend`                                                      |
| Code step — wrong code                 | —                                    | Kratos message `4010008`                                                    |
| Code step — expired                    | —                                    | Message `4060004`; resend is enabled                                        |
| Code step — rate limited               | —                                    | HTTP 429; countdown holds the resend                                        |
| Create an account                      | `registration/browser`               | `traits.email`, `traits.name`, `method=code`                                |
| Create an account — already registered | —                                    | Message `4000007`, steered to sign-in                                       |
| Confirm your email                     | `verification/browser`               | Same code component, different words                                        |
| Verified                               | —                                    | Session issued, redirect to `return_to`                                     |
| Recover an account                     | `recovery/browser`                   | `method=code`                                                               |
| Recovery sent                          | —                                    | Message `1060003` — deliberately vague, does not confirm the address exists |
| Account                                | `settings/browser` + `GET /sessions` | Sessions are an API read, not a flow                                        |
| Flow expired                           | —                                    | `410 Gone`                                                                  |
| Offline                                | —                                    | Never reaches Kratos; says what still works offline                         |
| Unhandled error                        | `self-service/errors?id=`            | Shows the reference id, not the address                                     |

## Copy and translation

`authCopy.ts` holds the English default for every string, keyed by the i18n key it will use
once the language docs carry it. `useAuthCopy()` prefers the translation and falls back to
that default, so the screens read correctly today and translate later without touching a
component. The table above doubles as the string inventory for whoever adds the keys.

## Open questions

- Does the CMS stay on the current OIDC providers while the app moves to Kratos, or is
  Kratos meant to serve both? The screens assume app-only; the method list still shows OIDC
  providers alongside email, so both can coexist.
- The privacy-policy gate (`useAuthWithPrivacyPolicy`) currently wraps every login start.
  The designs carry a privacy note in the footer instead — decide whether the modal stays in
  front of the flow or the note replaces it.
- Is a guest's bookmark set meant to sync per user once they have an account? The upgrade
  screen promises "everything saved on this device comes with you", which is true today only
  because nothing moves. It becomes a real promise the moment bookmarks sync.

## Proof of concept

The screens are wired to a real Kratos. `kratos/README.md` has the run
instructions; the short version is `docker compose -f kratos/docker-compose.yml up -d`
plus `VITE_KRATOS_URL="/.ory"` in `app/.env`. Without that variable the `/auth/*`
routes are not registered at all, so the PoC is inert wherever it hasn't been
switched on.

What is implemented:

- `app/src/auth/kratos/client.ts` — the flow API over `fetch`, no SDK. Every
  outcome is a value rather than a throw, because a 400 carrying validation
  errors is an ordinary step in these flows.
- `app/src/auth/kratos/nodes.ts` — builds the submitted payload **from the flow's
  own `ui.nodes`**. That is what keeps `csrf_token`, echoed traits, and any field
  a Kratos upgrade adds in the body without a code change here.
- `app/src/auth/kratos/useKratosAuth.ts` — the state machine behind the screens:
  address step → code step → session, plus resend cooldown, flow expiry and the
  offline case.
- `app/src/pages/auth/KratosAuthPage.vue` — picks which designed screen renders
  for the current step. One component serves login, signup, verification and
  recovery, because Kratos models them as the same two-step shape.

### What was verified against Kratos v1.3.1, not assumed

- **Sign-up works in one method.** Posting `method: "code"` with traits to the
  registration flow sends the code directly — the two-step `profile` screen newer
  Kratos versions show by default is not on the path. Second post with the code
  returns `200` and an active session, because registration runs the `session` hook.
- **Login is the same shape** with `identifier` instead of `traits.email`. The
  flow itself says which field it wants, so `identifierField()` reads it off the
  nodes rather than hard-coding a table.
- **Flat dotted keys are accepted as JSON.** `{"traits.email": "…"}` populates the
  trait — so the payload built straight from node names needs no un-flattening.
- **The proxy topology holds.** Through `/.ory` the CSRF cookie comes back as
  `Domain=localhost; SameSite=Lax` and `ui.action` points at the app's own origin.

The recorded flows are checked in as `fixtures.spec-data.json` and the specs
assert against them, so the tests describe what Kratos actually sends.

## The gap this PoC does not close

**A Kratos session does not authenticate anything to the Luminary API.** Today
`AuthGuard` and `socketio.ts` validate a JWT against the JWKS of the provider named
in `x-auth-provider-id`. Kratos issues a cookie session, not a JWT. So a user who
completes this flow is signed in to Kratos and still anonymous to Luminary — which
is fine for the PoC (guests are anonymous by design) and blocks nothing that guests
can already do.

Two ways to close it, when it matters:

1. **Introspect in the API.** A new branch in `AuthIdentityService` that calls
   Kratos' `/sessions/whoami` with the forwarded cookie, caches the answer briefly,
   and maps the identity onto groups through `AutoGroupMappings` under a synthetic
   provider id. No new infrastructure, no new crypto; costs one cacheable hop, and
   the socket handshake needs the cookie rather than a bearer token.
2. **Put Ory Oathkeeper in front.** It converts the session into a JWT the existing
   JWKS path already validates, so the API changes not at all — at the price of
   another service to run and configure.

For a self-hosted deployment I'd take (1): it keeps the moving parts in a codebase
we own, and the identity→groups mapping it needs is a thing `AuthIdentityService`
already does. Either way it is a deliberate second step, not an oversight in this one.

## Using the existing AuthProvider system via Ory Hydra

Kratos alone cannot be an `AuthProvider` doc: it has no `/authorize`, no
`client_id`, no JWKS and issues no JWT. **Hydra can.** Hydra is Ory's OAuth2 /
OIDC server, and Kratos becomes the thing that authenticates users for it — so
from Luminary's side it is an ordinary OIDC provider and the existing model
applies unchanged.

The shape:

```
app → Hydra /oauth2/auth → our /auth/login (the Kratos flow, these screens)
    → Kratos accepts the login request → Hydra → our consent endpoint
    → Hydra issues a JWT → the API validates it exactly as it does today
```

### What has to be true for the current API code to accept it

Checked against `api/src/auth/authIdentity.service.ts`, not assumed:

- **JWT access tokens must be switched on.** Hydra issues opaque tokens by
  default, and an opaque token fails `jwtService.verifyAsync` outright. Set
  `strategies.access_token: jwt` in Hydra's config file — the
  `OAUTH2_ACCESS_TOKEN_STRATEGY` environment variable appears only in Hydra's
  own tests and does not work.
- **The issuer must match exactly.** The API builds `https://${provider.domain}/`
  — hard-coded scheme, trailing slash, no path. So Hydra's `urls.self.issuer`
  has to be `https://<domain>/`. A Hydra mounted at `https://example.com/hydra/`
  or served over http will fail validation with no way to express it in an
  `AuthProvider` doc.
- **JWKS lines up.** The API fetches `https://${provider.domain}/.well-known/jwks.json`,
  which is exactly where self-hosted Hydra publishes.
- **The client id check passes.** The API compares `azp ?? client_id` against
  `provider.clientId`; Hydra's JWT access tokens carry `client_id`.
- **Audience.** `app/src/auth.ts` already sends `audience` as an authorization
  parameter, which Hydra supports — the client must be configured to allow that
  audience.

### Group mappings work, at a different claim path

Custom claims set when accepting consent land under **`ext`** in Hydra's JWT
access tokens, not at the top level. So an `AutoGroupMappings` condition reads
`ext.email` rather than `email`. Nothing needs changing for that:
`extractClaimValue` already walks dotted paths. Hydra's
`allowed_top_level_claims` can promote specific claims instead, with
`mirror_top_level_claims` and `preserve_ext_claims` deciding whether they are
also kept under `ext`.

### What we would still have to build

Kratos handles the login half once `oauth2_provider.url` points at Hydra's admin
API: it reads the `login_challenge`, validates it, honours Hydra's `skip` flag,
and on success calls `PUT /admin/oauth2/auth/requests/login/accept` with the
identity and session ids (the session's AMR flows into the ID token's `amr`).

**Consent is not Kratos' job.** We would own that endpoint. For a first-party app
it can auto-accept, but it is still ours to write — and it is the natural place
to inject the claims the group mappings read.

### The trade

Gained: no change to the API's auth model, the CMS can add it as an ordinary
provider with no code change, and guests get the same group machinery as BCC
users.

Paid: a second Ory service and its database, a consent endpoint of our own, the
issuer/JWKS constraints above pinning the deployment topology, and the redirect
round-trip — the in-app, never-leave-the-page property that motivated this design
goes away.

The screens are not wasted either way: under Hydra they become the login UI
Kratos drives.

**Worth doing if guests are meant to be real Luminary users with groups.** If the
goal is only that a reader keeps their bookmarks across devices, Kratos plus
session introspection in the API is much less machinery for the same outcome.

## Recommendation

**Take the Hydra path, and drop the idea of teaching `AuthProviderDto` a second
kind.** The discriminator would have put a second code path through the most
security-sensitive code in the system — the one whose failure codes already drive
eviction and silent-refresh logic in both clients (see the cross-package
contracts in the root `CLAUDE.md`) — and kept it there forever. Hydra makes that
unnecessary: a guest becomes an ordinary OIDC provider, added from the CMS,
mapped to groups by the machinery that already exists.

The deciding evidence is that a **"Guest" `AuthProvider` doc already exists** in
the running system. That says the intended model is _guest = an authenticated
principal that gets groups_, not _guest = an anonymous reader_. Hydra preserves
that model exactly; Kratos on its own replaces it with a second, parallel one.

Be clear about what it costs, though: **the never-leave-the-app property goes
away.** The user does bounce through Hydra's origin. What they do _not_ lose is
our screens — Hydra's `urls.login` points back at `/auth/login`, so the pages
they actually look at are the ones in this branch, on our domain, with our
branding. It ends up the same shape as the existing BCC flow.

### Order to build it

1. **Now** — nothing. The Kratos-only PoC stands as the design proof. It touches
   no production path, so there is nothing to undo.
2. **Hydra beside Kratos** in the same compose file. Public client with PKCE,
   `strategies.access_token: jwt`, issuer on `https://<domain>/` with the
   trailing slash, `urls.login` → `/auth/login`, `urls.consent` → `/auth/consent`.
3. **A consent endpoint of our own**, auto-accepting for the first-party client
   only — never for arbitrary clients.
4. **A `Guest` provider doc from the CMS**, pointing at Hydra's domain, client id
   and audience. No change in `api/` or `app/src/auth.ts`. Verify the JWT
   validates before going further.
5. **`AutoGroupMappings` for that provider id**, then guests have groups.
6. **Retire the interim entry** — "Sign in as Guest" becomes an ordinary provider
   button again, and the bespoke `/auth/*` routes exist only as Hydra's login UI.

### Decide the claim contract before writing any of it

The consent endpoint decides what the token carries, and the group mappings are
written against it — so getting it wrong is expensive to change once mappings
exist in production. Suggested: a stable identity id, `email`, and a `tier`
marker for guests, **promoted with `allowed_top_level_claims`** rather than left
under `ext`. Mappings then read `email` for every provider instead of `email` for
one and `ext.email` for another, and the CMS config stays uniform.

### Two things that already line up

- `app/src/auth.ts` requests `openid profile email offline_access`, and
  `signinSilent()` throws without a refresh token — so Hydra's client must be
  allowed `offline_access` and issue refresh tokens. The app itself needs no
  change.
- The JWKS path and the `azp ?? client_id` check match Hydra's output as-is.
