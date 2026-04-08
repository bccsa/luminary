# Auth Provider Setup

This guide explains how to run the auth provider setup script inside the API Docker container.

## Prerequisites

- The API container must be running
- The container must have access to CouchDB (via `DB_CONNECTION_STRING` and `DB_DATABASE` in `.env`)

## Running the script

Find your running API container name:

```sh
docker ps
```

Then run the setup script interactively:

```sh
docker exec -it <container_name> npm run auth-setup
```

The script will present a menu with the following options:

1. **Add Auth Provider** - Create a new OIDC provider (domain, audience, client ID, group mappings, etc.)
2. **Modify Auth Provider** - Edit an existing provider's configuration
3. **Configure Default Groups** - Set which groups are automatically assigned to all users
4. **Fix Group ACLs** - Ensure the required ACL entries exist on group documents for auth provider doc types
5. **Full Setup** - Runs options 1, 3, and 4 in sequence (recommended for first-time setup)

## First-time setup

For a new deployment, select option **5 (Full Setup)**. You will need:

- **Domain** - Your OIDC issuer domain (e.g. `yourdomain.auth0.com`)
- **Audience** - The API audience identifier (defaults to `https://<domain>/api/v2/`)
- **Client ID** - The OIDC client ID from your identity provider

The script will also ask about optional settings like display labels, claim namespaces, user field mappings, and group mappings. Sensible defaults are provided where possible — press Enter to accept them.

## Backfilling existing users

After adding a provider, the script will offer to backfill the new `providerId` onto all existing user documents. Accept this if you are migrating from a single-provider setup to multi-provider.
