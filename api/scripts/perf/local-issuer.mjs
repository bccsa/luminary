/**
 * Local OIDC issuer for authenticated performance runs.
 *
 * The audit's anonymous path costs almost nothing, so the interesting numbers only appear
 * under a real token. This serves a JWKS for the e2e signing key on the port the
 * `auth-provider-e2e` AuthProvider document already points at, and mints an access token for
 * one of the e2e personas — so no database writes are needed to set it up.
 *
 *   node scripts/perf/local-issuer.mjs [persona]     # default: editor1
 *
 * Then, in another terminal, run the API with the insecure-domain flag (the provider's domain
 * is http://, which the API refuses unless explicitly allowed) and point the audit at it:
 *
 *   PERF_TRACE=true AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true npm run start
 *   npm run perf:audit -- --token="$(cat .perf-token)" --provider=auth-provider-e2e
 *
 * Pass the flag on the command line only — it is a security switch, not a setting.
 *
 * Note: every authenticated request currently rewrites the persona's User document
 * (`lastLogin`), so a full run adds a few thousand revisions to it.
 */
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.resolve(here, "../../../playwright-tests/.auth/idp-key-primary.json");
const TOKEN_FILE = path.resolve(here, "../../.perf-token");

const PORT = 8099;
const ORIGIN = `http://127.0.0.1:${PORT}`;
/** Trailing slash included — this is the `iss` the API expects (see util/authority.ts). */
const ISSUER = `${ORIGIN}/`;
const AUDIENCE = "luminary-e2e";
const CLIENT_ID = "luminary-e2e-client";
const KID = "perf-audit-key";

/** Personas seeded as User documents by the e2e fixtures. */
const PERSONAS = {
    editor1: { sub: "e2e|editor1", email: "editor1@users.test", name: "E2E Editor 1" },
    editor2: { sub: "e2e|editor2", email: "editor2@users.test", name: "E2E Editor 2" },
    superadmin: { sub: "e2e|super-admin", email: "superadmin@users.test", name: "E2E Super Admin" },
    private: { sub: "e2e|private-user", email: "private@users.test", name: "E2E Private User" },
};

if (!fs.existsSync(KEY_FILE)) {
    console.error(
        `Signing key not found at ${KEY_FILE}.\n` +
            "It is created by the e2e fixtures; run the Playwright suite once, or copy a key there.",
    );
    process.exit(1);
}

const personaName = process.argv[2] ?? "editor1";
const persona = PERSONAS[personaName];
if (!persona) {
    console.error(`Unknown persona "${personaName}". Available: ${Object.keys(PERSONAS).join(", ")}`);
    process.exit(1);
}

const { privateKeyPem } = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
const publicJwk = crypto.createPublicKey(crypto.createPrivateKey(privateKeyPem)).export({ format: "jwk" });
const jwks = { keys: [{ ...publicJwk, kid: KID, alg: "RS256", use: "sig" }] };

const server = http.createServer((req, res) => {
    const send = (body) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
    };
    if (req.url.startsWith("/.well-known/jwks.json")) return send(jwks);
    if (req.url.startsWith("/.well-known/openid-configuration"))
        return send({ issuer: ISSUER, jwks_uri: `${ORIGIN}/.well-known/jwks.json` });
    res.writeHead(404).end();
});

server.on("error", (err) => {
    console.error(
        err.code === "EADDRINUSE"
            ? `Port ${PORT} is already in use — another issuer is probably still running.`
            : err.message,
    );
    process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
    // `azp` carries the client id: the API cross-checks it against the AuthProvider document.
    const token = jwt.sign(
        {
            sub: persona.sub,
            email: persona.email,
            name: persona.name,
            aud: AUDIENCE,
            azp: CLIENT_ID,
            iss: ISSUER,
            scope: "openid profile email",
        },
        privateKeyPem,
        { algorithm: "RS256", keyid: KID, expiresIn: "2h" },
    );
    fs.writeFileSync(TOKEN_FILE, token);
    console.log(`Issuer listening on ${ORIGIN}`);
    console.log(`Persona: ${personaName} (${persona.email})`);
    console.log(`Token (valid 2h) written to ${TOKEN_FILE}`);
    console.log("\nLeave this running, then in another terminal:");
    console.log("  PERF_TRACE=true AUTH_ALLOW_INSECURE_PROVIDER_DOMAIN=true npm run start");
    console.log('  npm run perf:audit -- --token="$(cat .perf-token)" --provider=auth-provider-e2e');
});
