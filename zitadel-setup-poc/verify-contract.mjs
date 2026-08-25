// Checks a running Zitadel against the exact constraints
// api/src/auth/authIdentity.service.ts imposes on an AuthProvider, so the
// answer comes from the running stack rather than from reading docs.
//
//   node verify-contract.mjs [--domain=...] [--client-id=...] [--audience=...] [--token=<jwt>]
//
// Without --token the token-shaped checks are skipped; grab one from the app's
// network tab or an authorization-code flow to run them.

const arg = (name, fallback) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const domain = arg("domain", "auth.luminary.local");
const clientId = arg("client-id", null);
const audience = arg("audience", clientId);
const token = arg("token", null);

const results = [];
const record = (id, ok, detail, fix) => results.push({ id, ok, detail, fix });
const skip = (id, detail) => results.push({ id, ok: null, detail });

const b64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
}

// 1 — discovery reachable, and the issuer it advertises
let discovery = null;
try {
    discovery = await getJson(`https://${domain}/.well-known/openid-configuration`);
    record("discovery", true, `reachable, issuer=${discovery.issuer}`);
} catch (e) {
    record("discovery", false, `unreachable (${e.message})`, "Is the stack up and does /etc/hosts point auth.luminary.local at 127.0.0.1?");
}

// 2 — the API builds `https://${provider.domain}/` and jsonwebtoken compares it
//     to the iss claim as an exact string.
if (discovery) {
    const expected = `https://${domain}/`;
    const ok = discovery.issuer === expected;
    record(
        "issuer",
        ok,
        `advertised "${discovery.issuer}" vs required "${expected}"`,
        ok ? undefined : "Trailing-slash mismatch. The API hardcodes it for Auth0. Either accept both forms in authIdentity.service.ts or add an explicit issuer field to AuthProviderDto.",
    );
}

// 3 — the API fetches this fixed path; the Caddyfile maps it onto /oauth/v2/keys
let jwks = null;
try {
    jwks = await getJson(`https://${domain}/.well-known/jwks.json`);
    const n = jwks.keys?.length ?? 0;
    record("jwks", n > 0, `${n} key(s) at /.well-known/jwks.json`, n > 0 ? undefined : "Endpoint answered but published no keys.");
} catch (e) {
    record("jwks", false, `not served (${e.message})`, "Zitadel publishes at /oauth/v2/keys; the Caddyfile rewrite should expose it here.");
}
if (discovery?.jwks_uri) {
    record("jwks-native", true, `Zitadel's own jwks_uri is ${discovery.jwks_uri}`);
}

// 4/5 — everything that can only be seen on a real token
if (!token) {
    skip("token-format", "no --token supplied");
    skip("alg", "no --token supplied");
    skip("aud", "no --token supplied");
    skip("azp", "no --token supplied");
} else {
    const parts = token.split(".");
    if (parts.length !== 3) {
        record("token-format", false, "not a JWT (opaque token)", "Set the app's accessTokenType to OIDC_TOKEN_TYPE_JWT — an opaque token fails jwtService.verifyAsync outright.");
    } else {
        record("token-format", true, "three-segment JWT");
        const header = JSON.parse(b64url(parts[0]));
        const payload = JSON.parse(b64url(parts[1]));

        // The API compares the iss claim itself, so the token is the real test —
        // the discovery document only predicts what it will contain.
        const expectedIss = `https://${domain}/`;
        const issOk = payload.iss === expectedIss;
        record(
            "iss-claim",
            issOk,
            `iss="${payload.iss}" vs required "${expectedIss}"`,
            issOk ? undefined : "jsonwebtoken compares iss exactly; see the issuer check above for the fix.",
        );

        const algOk = header.alg === "RS256";
        record("alg", algOk, `alg=${header.alg}`, algOk ? undefined : "The API allows only RS256.");

        if (jwks?.keys) {
            const known = jwks.keys.some((k) => k.kid === header.kid);
            record("kid", known, `kid=${header.kid} ${known ? "found" : "absent"} in JWKS`, known ? undefined : "Token was signed by a key the JWKS endpoint does not publish.");
        }

        const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
        const audOk = audience ? auds.includes(audience) : null;
        if (audience) {
            record("aud", audOk, `aud=[${auds.join(", ")}] expecting "${audience}"`, audOk ? undefined : "Request the urn:zitadel:iam:org:project:id:<projectId>:aud scope so the project lands in aud.");
        } else {
            skip("aud", "no --audience supplied");
        }

        const tokenClient = payload.azp ?? payload.client_id;
        if (clientId) {
            // The API only enforces this when the claim is present.
            const azpOk = !tokenClient || tokenClient === clientId;
            record("azp", azpOk, `azp/client_id=${tokenClient ?? "(absent)"} expecting "${clientId}"`, azpOk ? undefined : "Token was issued to a different client than the AuthProvider doc names.");
        } else {
            skip("azp", "no --client-id supplied");
        }
    }
}

const mark = (ok) => (ok === null ? "SKIP" : ok ? "PASS" : "FAIL");
console.log("\nContract checks against api/src/auth/authIdentity.service.ts\n");
for (const r of results) {
    console.log(`  ${mark(r.ok).padEnd(5)} ${r.id.padEnd(14)} ${r.detail}`);
    if (r.fix) console.log(`        ↳ ${r.fix}`);
}
const failed = results.filter((r) => r.ok === false).length;
const skipped = results.filter((r) => r.ok === null).length;
console.log(`\n${results.filter((r) => r.ok).length} passed, ${failed} failed, ${skipped} skipped\n`);
process.exit(failed > 0 ? 1 : 0);
