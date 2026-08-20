# Kratos — guest auth proof of concept

Development only. Nothing here is deployed, and nothing in `api/` depends on it.

## Run it

```sh
docker compose -f kratos/docker-compose.yml up -d
```

Then set `VITE_KRATOS_URL="/.ory"` in `app/.env` and start the app as usual
(`npm run dev` in `app/`). The routes appear only when that variable is set.

- `/auth/login` — sign in with an emailed one-time code
- `/auth/signup` — create an account with the same code method
- `/auth/verify`, `/auth/recovery`, `/auth/account`
- **Codes arrive in Mailpit: http://localhost:8025** — no mail leaves the machine.

## Why the /.ory proxy

Kratos' `serve.public.base_url` is the _app's_ origin plus `/.ory`, not Kratos'
own address, and Vite proxies that prefix to the container. Every URL Kratos
hands the browser is therefore same-site with the app, so the session and CSRF
cookies survive. Production wants the same shape from a real reverse proxy —
that is the whole reason the screens live in the app rather than in a separate
self-service UI.

## What is configured

- `code.passwordless_enabled: true` — one setting turns the emailed code into a
  login method _and_ a registration method. `password` and `link` are off.
- `identity.schema.json` — a `guest` identity: `email` (required, the code
  identifier, verifiable) and an optional `name`.
- Registration runs the `session` hook, so signing up ends signed in.
- SQLite on a named volume, so identities survive `docker compose down`. Use
  `down -v` to start from nothing.

## Reset

```sh
docker compose -f kratos/docker-compose.yml down -v
```
