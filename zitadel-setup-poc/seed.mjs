// Creates the project and OIDC app the Luminary app would use, then prints the
// AuthProvider field values to enter in the CMS. Run after the stack is up.
import { readFileSync } from "node:fs";

const DOMAIN = process.env.ZITADEL_DOMAIN || "auth.luminary.local";
const BASE = `https://${DOMAIN}`;
const PAT_PATH = process.env.PAT_PATH || "./secrets/seed-pat.txt";
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:4174";

let pat;
try {
    pat = readFileSync(PAT_PATH, "utf8").trim();
} catch {
    console.error(`No PAT at ${PAT_PATH}. Start the stack first — first-instance setup writes it.`);
    process.exit(1);
}

async function api(path, body, method = "POST") {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`);
    return json;
}

// The Login v2 container authenticates as this same machine user, and its
// session calls are refused with AUTH-AWfge unless it holds IAM_LOGIN_CLIENT.
// IAM_OWNER from first-instance setup does not imply it.
const members = await api("/admin/v1/members/_search", {});
const loginClient = members.result?.find((m) => m.preferredLoginName === "seed-bot");
if (loginClient && !loginClient.roles.includes("IAM_LOGIN_CLIENT")) {
    await api(
        `/admin/v1/members/${loginClient.userId}`,
        { roles: [...loginClient.roles, "IAM_LOGIN_CLIENT"] },
        "PUT",
    );
}

const project = await api("/management/v1/projects", { name: "Luminary" });
const projectId = project.id;

const app = await api(`/management/v1/projects/${projectId}/apps/oidc`, {
    name: "Luminary app",
    redirectUris: [`${APP_ORIGIN}/callback`, `${APP_ORIGIN}/`],
    postLogoutRedirectUris: [`${APP_ORIGIN}/`],
    responseTypes: ["OIDC_RESPONSE_TYPE_CODE"],
    grantTypes: ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
    // A browser SPA holds no secret, so PKCE with no client auth — this is what
    // oidc-client-ts in app/src/auth.ts already does.
    appType: "OIDC_APP_TYPE_USER_AGENT",
    authMethodType: "OIDC_AUTH_METHOD_TYPE_NONE",
    // The API runs jwtService.verifyAsync, which an opaque token fails outright.
    accessTokenType: "OIDC_TOKEN_TYPE_JWT",
    accessTokenRoleAssertion: true,
    devMode: true,
});

const audienceScope = `urn:zitadel:iam:org:project:id:${projectId}:aud`;

console.log(`
Project ..... ${projectId}
Client ID ... ${app.clientId}

AuthProvider doc (CMS → Auth providers):
  domain    ${DOMAIN}
  clientId  ${app.clientId}
  audience  ${app.clientId}

The app must request this scope so the project lands in the token's aud claim:
  ${audienceScope}
`);
