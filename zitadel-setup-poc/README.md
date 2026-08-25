# Zitadel PoC

A second proof of concept for replacing Auth0 as the identity provider for public
users, to be compared against `../ory-kratos-setup-poc`. Both aim at the same
target: an OIDC provider that the API accepts as an ordinary `AuthProvider` doc,
with no change to `api/` or `app/`.

Nothing here is wired into the monorepo — it is a standalone Compose stack, same
as the Kratos PoC.

## Status

**Not yet run.** The stack and scripts are written but have not been started
against a Docker daemon, unlike the Kratos PoC which is known to work. Treat the
two "expected to fail" rows below as predictions that `verify-contract.mjs` will
confirm or refute — that is what the script is for.

## Why a second PoC

The Kratos + Hydra stack is architecturally right: it makes the identity provider
conform to the contract the repo already has, rather than making the app conform
to the provider. This PoC keeps that property and asks a narrower question — how
much of the stack is essential?

Ory ships no login UI and no admin console by design, so both are yours to write.
Zitadel is a single service that includes an OIDC provider, user management, a
login UI and an admin console.

|  | Kratos + Hydra | Zitadel |
| --- | --- | --- |
| Long-running services | 7 | 3 |
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
Hydra satisfies all five. For Zitadel, two are expected to need work:

| Constraint | Hydra | Zitadel |
| --- | --- | --- |
| JWT access tokens, not opaque | `strategies.access_token: jwt` | app `accessTokenType: OIDC_TOKEN_TYPE_JWT` (set by `seed.mjs`) |
| `RS256` | yes | yes |
| `azp`/`client_id` matches `provider.clientId` | yes | yes |
| JWKS at `/.well-known/jwks.json` | published there natively | **published at `/oauth/v2/keys`** — the Caddyfile rewrites the path |
| `iss` exactly `https://<domain>/` | issuer configured with the trailing slash | **expected to be `https://<domain>` with no trailing slash** |

The trailing slash is an Auth0-ism baked into the API:

```ts
issuer: `https://${provider.domain}/`,
```

Auth0 uses a trailing slash; most standards-compliant issuers do not. If the
prediction holds, the fix is one of:

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

First-instance setup writes a machine-user token to `secrets/seed-pat.txt`, which
the seed script uses:

```sh
node seed.mjs
```

It prints the `domain`, `clientId` and `audience` for an `AuthProvider` doc, plus
the `urn:zitadel:iam:org:project:id:<projectId>:aud` scope the app must request
for the project to appear in the token's `aud` claim.

- Console: `https://auth.luminary.local/ui/console` (`admin` / `Password1!`)
- Discovery: `https://auth.luminary.local/.well-known/openid-configuration`

## Verifying

```sh
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
