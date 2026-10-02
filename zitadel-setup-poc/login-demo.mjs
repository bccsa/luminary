// Drives a real PKCE authorization-code flow against the seeded SPA client and
// prints the resulting access token's claims, so the API's contract can be
// checked against a browser-issued token rather than a machine-user one.
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";

const DOMAIN = process.env.ZITADEL_DOMAIN || "auth.luminary.local";
const BASE = `https://${DOMAIN}`;
const CLIENT_ID = process.argv[2];
const PROJECT_ID = process.argv[3];
const PORT = 4174;
const REDIRECT = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !PROJECT_ID) {
    console.error("usage: node --use-system-ca login-demo.mjs <clientId> <projectId>");
    process.exit(1);
}

const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
const verifier = b64url(randomBytes(32));
const challenge = b64url(createHash("sha256").update(verifier).digest());

const authUrl = `${BASE}/oauth/v2/authorize?` + new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: `openid profile email urn:zitadel:iam:org:project:id:${PROJECT_ID}:aud`,
    code_challenge: challenge,
    code_challenge_method: "S256",
});

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (!url.pathname.startsWith("/callback")) return res.writeHead(404).end();

    const code = url.searchParams.get("code");
    if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`No code: ${url.searchParams.get("error_description") || url.search}`);
        return;
    }

    const tokenRes = await fetch(`${BASE}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: CLIENT_ID,
            code_verifier: verifier,
        }),
    });
    const tok = await tokenRes.json();

    if (!tok.access_token) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(JSON.stringify(tok, null, 2));
        console.error("token exchange failed:", tok);
        server.close();
        return;
    }

    const claims = JSON.parse(Buffer.from(tok.access_token.split(".")[1], "base64url").toString());
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h2>Signed in. Claims printed in the terminal.</h2>");

    console.log("\n=== access token claims ===");
    console.log(JSON.stringify(claims, null, 2));
    console.log("\n=== access token ===\n" + tok.access_token + "\n");
    server.close();
});

server.listen(PORT, () => {
    console.log(`Listening on ${REDIRECT}\n\nOpen this to sign in:\n\n${authUrl}\n`);
});
