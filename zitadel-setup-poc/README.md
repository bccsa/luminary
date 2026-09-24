# Zitadel PoC

A second proof of concept for replacing Auth0 as the identity provider for public
users, to be compared against `../ory-kratos-setup-poc`. Both aim at the same
target: an OIDC provider that the API accepts as an ordinary `AuthProvider` doc,
with no change to `api/` or `app/`.

Nothing here is wired into the monorepo — it is a standalone Compose stack, same
as the Kratos PoC.

## Status

**Run and verified** against Docker on macOS with Zitadel v4.17.1. The stack
comes up clean, `seed.mjs` provisions the project and OIDC app, and
`verify-contract.mjs` reports 8 passed / 2 failed against a real RS256 JWT.

Both failures are the two predicted below, and they are the same failure seen
twice — the issuer's missing trailing slash, once in the discovery document and
once in the `iss` claim of an issued token. Everything else in the contract
passes unchanged: the JWKS rewrite works, `alg` is `RS256`, the token's `kid`
resolves in the published JWKS, and `aud` and `azp` behave as the API expects.

One thing the original stack got wrong: Zitadel v4 defaults to Login v2, which
ships as a separate `zitadel-login` container rather than inside the monolith.
Without it the instance still starts and the OIDC endpoints all answer, but every
login redirect — including the console's own sign-in — lands on `/ui/v2/login/*`
and returns 404. The container is now in the Compose file and Caddy routes that
path to it.

## Why a second PoC

The Kratos + Hydra stack is architecturally right: it makes the identity provider
conform to the contract the repo already has, rather than making the app conform
to the provider. This PoC keeps that property and asks a narrower question — how
much of the stack is essential?

Ory ships no login UI and no admin console by design, so both are yours to write.
Zitadel ships both. It is not quite a single service — from v4 the login UI runs
as its own container — but it is still four images you configure rather than
seven plus code you maintain.

|  | Kratos + Hydra | Zitadel |
| --- | --- | --- |
| Long-running services | 7 | 4 |
| One-shot migration jobs | 2 | 0 (self-migrating) |
| Databases | 2 schemas | 1 |
| Bespoke runtime code you maintain | 708 lines (login/consent + admin) | 0 |
| Login UI | you write it | shipped |
| Admin console | you write it | shipped |
| Language / runtime | Go | Go |

The 708 lines are `login-consent/server.js`, `login-consent/views.js` and
`admin/server.js` in the Kratos PoC — security-critical request paths (redirect
handling, consent grants, identity deletion) that would need CSRF, authentication
and an audit trail before shipping. Here the equivalent surface is `seed.mjs`, a
61-line one-shot setup script that never serves a request.

## The contract being tested

`api/src/auth/authIdentity.service.ts` imposes five constraints on any provider.
Hydra satisfies all five. Two need work for Zitadel, both confirmed against the
running stack rather than predicted:

| Constraint | Hydra | Zitadel |
| --- | --- | --- |
| JWT access tokens, not opaque | `strategies.access_token: jwt` | app `accessTokenType: OIDC_TOKEN_TYPE_JWT` (set by `seed.mjs`) |
| `RS256` | yes | yes |
| `azp`/`client_id` matches `provider.clientId` | yes | yes |
| JWKS at `/.well-known/jwks.json` | published there natively | **published at `/oauth/v2/keys`** — the Caddyfile rewrite fixes this, verified serving 2 keys |
| `iss` exactly `https://<domain>/` | issuer configured with the trailing slash | **is `https://<domain>`, no trailing slash** — in both discovery and the `iss` claim |
| Audience accepted by the CMS form | URL-shaped API identifier | **numeric project/client ID** — rejected by the CMS's `isValidAudience`, though the API itself accepts it |

A third Auth0-ism sits in the CMS rather than the API. The Auth Provider form
rejects the audience with "Audience must be an absolute URL":

```ts
// cms/src/components/authProvider/FormModal.vue
function isValidAudience(value: string): boolean {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
}
```

Zitadel's audience is a numeric project or client ID (`387937637261901827`) and
no setting makes it a URL, so the form cannot be satisfied as written. This one
is only a form rule: `AuthProviderDto` validates `audience` with `@IsString()`
`@IsNotEmpty()` and nothing more, and `jsonwebtoken` compares `aud` as an opaque
string. URL audiences are an Auth0 convention for its API identifiers, not an
OIDC requirement — the spec makes `aud` a case-sensitive string, usually the
client ID. Relaxing `isValidAudience` to "non-empty, no whitespace" would admit
Zitadel and Keycloak without weakening anything the API relies on.

The trailing slash is an Auth0-ism baked into the API:

```ts
issuer: `https://${provider.domain}/`,
```

Auth0 uses a trailing slash; most standards-compliant issuers do not. Zitadel
offers no setting to add one — `ExternalDomain` has no path component — so the
fix has to land in the API. It is one of:

1. Compare the issuer with the trailing slash optional in
   `authIdentity.service.ts` — smallest change, unblocks Zitadel and others.
2. Add an optional explicit `issuer` field to `AuthProviderDto`, so the issuer
   stops being derived from `domain`. Larger, but also the only option that fits
   providers whose issuer carries a path (Keycloak's is
   `https://host/realms/<realm>`) and would want a JWKS path of their own.

Neither is done here — this PoC deliberately changes nothing in `api/`.

## Running it

`auth.luminary.local` must resolve locally, matching the Kratos PoC:

```sh
echo "127.0.0.1 auth.luminary.local" | sudo tee -a /etc/hosts
```

Then:

```sh
cp .env.example .env          # masterkey must be exactly 32 characters
docker compose up -d
```

Caddy signs `auth.luminary.local` with its own internal CA, which Node does not
trust by default — the scripts fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
until it is handed the root certificate. Export it once:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./secrets/caddy-root.crt
```

First-instance setup writes a machine-user token to `secrets/seed-pat.txt`, which
the seed script uses:

```sh
NODE_EXTRA_CA_CERTS=./secrets/caddy-root.crt node seed.mjs
```

To reach the console in a browser without a warning, trust that same root in the
login keychain (macOS):

```sh
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain ./secrets/caddy-root.crt
```

It prints the `domain`, `clientId` and `audience` for an `AuthProvider` doc, plus
the `urn:zitadel:iam:org:project:id:<projectId>:aud` scope the app must request
for the project to appear in the token's `aud` claim.

- Console: `https://auth.luminary.local/ui/console` (`admin` / `Password1!`)
- Discovery: `https://auth.luminary.local/.well-known/openid-configuration`

## Branding

`brand.mjs` applies the Ory PoC's Luminary palette and logo to Zitadel's shipped
login screens via the org label policy, so the two PoCs can be compared on looks
as well as behaviour. It reads the tokens straight out of
`../ory-kratos-setup-poc/login-consent/views.js`:

```sh
node --use-system-ca brand.mjs
```

This restyles the shipped screens; it does not replace their markup. Zitadel's
login is themed through the label policy (colours, logo, light/dark), with the
strings overridable through the custom-text API. Replacing the layout outright
means running your own app against Zitadel's Session API and pointing the
instance's `LoginV2.BaseURI` at it — at which point you are maintaining login
code again, which is the cost this PoC was trying to avoid.

## Verifying

```sh
export NODE_EXTRA_CA_CERTS=./secrets/caddy-root.crt
node verify-contract.mjs                      # discovery + JWKS constraints
node verify-contract.mjs --client-id=... --audience=... --token=<jwt>   # all of them
```

It re-implements the checks `authIdentity.service.ts` performs and reports each
as PASS/FAIL with the remediation, exiting non-zero on any failure. Get a token
from the app's network tab after a sign-in, or from an authorization-code flow
against the seeded client.

## Not covered

The same gaps flagged for the Kratos PoC apply and are not addressed here either:
no SMTP courier, so verification and recovery mail will not send; no rate limiting
on public registration; and no guest-vs-registered identity distinction — that
product decision matters more than the choice of provider.

Secrets in this directory are placeholders. Postgres credentials, the Zitadel
masterkey and the admin password are all committed and must not be reused.
