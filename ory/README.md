# Ory — guest auth

Development only. Kratos authenticates, **Hydra issues the tokens**, so from
Luminary's side a guest is an ordinary OIDC provider: the app's existing
`oidc-client-ts` redirect and the API's existing JWKS validation both apply with
no special case for Kratos anywhere.

## Run it

```sh
docker compose -f ory/docker-compose.yml up -d
node ory/seed-auth-provider.mjs        # creates the "Sign in as Guest" provider doc
```

`api/.env` needs `HYDRA_ADMIN_URL` and `HYDRA_TRUSTED_CLIENT_ID` (see
`api/.env.example`), and `app/.env` needs `VITE_KRATOS_URL="/.ory"` for the
login screens. **Restart the API** after adding them.

Then sign in from the app's normal login modal — "Sign in as Guest" is a
provider button like any other. **Codes arrive in Mailpit: http://localhost:8025.**

## What runs

| Service | Port | Role                                                      |
| ------- | ---- | --------------------------------------------------------- |
| Kratos  | 4433 | Self-service login/registration. Never issues app tokens. |
| Kratos  | 4434 | Admin. Not reachable from the browser.                    |
| Hydra   | 4444 | OAuth2/OIDC. Issues the JWT the Luminary API validates.   |
| Hydra   | 4445 | Admin. Consent and logout are accepted here, by the API.  |
| Mailpit | 8025 | Catches the one-time codes.                               |

## The flow

```
app → Hydra /oauth2/auth
    → our /auth/login?login_challenge=…   (navigated, not fetched — see below)
    → Kratos: email, one-time code
    → Kratos accepts the OAuth2 login request
    → Hydra → the API's /oauth/consent  (server-side accept)
    → Hydra issues the code → app exchanges it → JWT
```

Two things that are easy to get wrong and are why the code looks as it does:

- **A browser flow must be navigated to, not fetched.** Asking
  `/self-service/login/browser?login_challenge=…` with `Accept: application/json`
  returns `200 null` when Kratos can complete the flow itself — the case where a
  live session lets it accept Hydra's request outright. Only a real navigation
  follows the `303`.
- **Consent is server work.** Accepting it needs Hydra's admin API, which a
  browser must never reach, so `urls.consent` points at the API rather than the
  web client. `skip_consent` on the client does _not_ remove the round trip in
  self-hosted Hydra — Hydra still asks, the API still has to answer.

## Claims

The API's consent accept injects `tier: "guest"`, and Hydra's
`allowed_top_level_claims` promotes it out of `ext`, so an `AutoGroupMappings`
condition reads `tier` rather than `ext.tier` — the same shape as every other
provider's mappings.

Give guests their groups with a mapping on this provider whose condition is
**"User is authenticated"**: every guest who signs in through it lands in the
groups you choose. No per-user claim needed.

## Reset

```sh
docker compose -f ory/docker-compose.yml down -v
```
