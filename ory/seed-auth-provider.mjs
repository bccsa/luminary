#!/usr/bin/env node
// Creates (or updates) the AuthProvider doc that points Luminary at Hydra.
//
// A Hydra-backed guest is an ordinary OIDC provider, so this writes exactly the
// same shape the CMS writes — there is no Kratos-specific field. Run it once:
//   node ory/seed-auth-provider.mjs
// Reads DB_CONNECTION_STRING and DB_DATABASE from api/.env.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function env() {
    const raw = readFileSync(join(here, "..", "api", ".env"), "utf8");
    const values = {};
    for (const line of raw.split("\n")) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
    return values;
}

const { DB_CONNECTION_STRING, DB_DATABASE } = env();
if (!DB_CONNECTION_STRING || !DB_DATABASE) {
    console.error("DB_CONNECTION_STRING and DB_DATABASE must be set in api/.env");
    process.exit(1);
}

// fetch() refuses a URL carrying credentials, and CouchDB connection strings
// conventionally carry them — so they move to an Authorization header.
const connection = new URL(DB_CONNECTION_STRING);
const auth =
    connection.username || connection.password
        ? "Basic " +
          Buffer.from(
              `${decodeURIComponent(connection.username)}:${decodeURIComponent(connection.password)}`,
          ).toString("base64")
        : undefined;
connection.username = "";
connection.password = "";

const base = `${connection.toString().replace(/\/+$/, "")}/${DB_DATABASE}`;
const headers = { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) };
const id = "auth-provider-guest-hydra";

// `domain` carries its scheme because Hydra runs over http locally. The API
// honours an explicit scheme and assumes https without one, so a production
// entry is the bare hostname exactly as every other provider's is.
const doc = {
    _id: id,
    type: "authProvider",
    memberOf: [],
    updatedTimeUtc: Date.now(),
    domain: "http://localhost:4444",
    clientId: "luminary-app",
    audience: "luminary-api",
    label: "Sign in as Guest",
    displayName: "Guest (Ory)",
    sortIndex: 0,
};

const existing = await fetch(`${base}/${id}`, { headers });
if (existing.ok) doc._rev = (await existing.json())._rev;

const response = await fetch(`${base}/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(doc),
});

if (!response.ok) {
    console.error(`CouchDB refused the write (${response.status}):`, await response.text());
    process.exit(1);
}
console.log(existing.ok ? "updated" : "created", id, "->", doc.domain);
console.log("The provider appears in the app's login modal as:", doc.label);
