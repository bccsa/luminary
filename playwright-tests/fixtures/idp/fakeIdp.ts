import http from "node:http";
import { randomUUID } from "node:crypto";
import type { SigningKey } from "./signingKey";
import { mintTokenSet, readRefreshToken, type TokenIdentity, type TokenSet } from "./mint";

export type FakeIdpOptions = {
    key: SigningKey;
    audience: string;
    clientId: string;
    host?: string;
    /** 0 asks the OS for a free port; read the real one off `origin` afterwards. */
    port?: number;
    /**
     * Identities `/authorize` can log in as, keyed by the value the client sends
     * as `login_hint`. Only needed for tests that drive the real redirect flow.
     */
    identities?: Record<string, TokenIdentity>;
    defaultIdentity?: TokenIdentity;
};

export type FakeIdp = {
    /** e.g. `http://127.0.0.1:8099` — this is what goes in AuthProvider.domain. */
    origin: string;
    /** e.g. `http://127.0.0.1:8099/` — the `iss` claim, trailing slash included. */
    issuer: string;
    audience: string;
    clientId: string;
    mint: (identity: TokenIdentity, opts?: { expiresInSeconds?: number }) => TokenSet;
    stop: () => Promise<void>;
};

/** Every response is read cross-origin by the browser under test. */
const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
};

function json(res: http.ServerResponse, status: number, body: unknown) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        ...CORS_HEADERS,
        "content-type": "application/json",
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
    });
}

export async function startFakeIdp(options: FakeIdpOptions): Promise<FakeIdp> {
    const host = options.host ?? "127.0.0.1";
    const identities = options.identities ?? {};
    // Authorization codes are single-use and live only for the run.
    const pendingCodes = new Map<string, { identity: TokenIdentity; nonce?: string }>();

    let origin = "";
    let issuer = "";

    const mint = (identity: TokenIdentity, opts?: { expiresInSeconds?: number }, nonce?: string) =>
        mintTokenSet({
            key: options.key,
            issuer,
            audience: options.audience,
            clientId: options.clientId,
            identity,
            nonce,
            expiresInSeconds: opts?.expiresInSeconds,
        });

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", origin || `http://${host}`);

        if (req.method === "OPTIONS") {
            res.writeHead(204, CORS_HEADERS);
            res.end();
            return;
        }

        if (url.pathname === "/.well-known/openid-configuration") {
            json(res, 200, {
                issuer,
                authorization_endpoint: `${origin}/authorize`,
                token_endpoint: `${origin}/oauth/token`,
                jwks_uri: `${origin}/.well-known/jwks.json`,
                userinfo_endpoint: `${origin}/userinfo`,
                end_session_endpoint: `${origin}/logout`,
                response_types_supported: ["code"],
                subject_types_supported: ["public"],
                id_token_signing_alg_values_supported: ["RS256"],
                grant_types_supported: ["authorization_code", "refresh_token"],
                code_challenge_methods_supported: ["S256"],
                scopes_supported: ["openid", "profile", "email", "offline_access"],
            });
            return;
        }

        if (url.pathname === "/.well-known/jwks.json") {
            json(res, 200, { keys: [options.key.publicJwk] });
            return;
        }

        // Real redirect flow. PKCE parameters are accepted and ignored — there is
        // no attacker to defend against here, and verifying them would only add a
        // way for the fixture itself to fail.
        if (url.pathname === "/authorize") {
            const hint = url.searchParams.get("login_hint") ?? "";
            const identity = identities[hint] ?? options.defaultIdentity;
            const redirectUri = url.searchParams.get("redirect_uri");

            if (!identity || !redirectUri) {
                json(res, 400, {
                    error: "invalid_request",
                    error_description: !redirectUri
                        ? "redirect_uri is required"
                        : `no identity registered for login_hint "${hint}"`,
                });
                return;
            }

            const code = randomUUID();
            pendingCodes.set(code, {
                identity,
                nonce: url.searchParams.get("nonce") ?? undefined,
            });

            const target = new URL(redirectUri);
            target.searchParams.set("code", code);
            const state = url.searchParams.get("state");
            if (state) target.searchParams.set("state", state);
            res.writeHead(302, { location: target.toString() });
            res.end();
            return;
        }

        if (url.pathname === "/oauth/token" && req.method === "POST") {
            const params = new URLSearchParams(await readBody(req));
            const grantType = params.get("grant_type");

            if (grantType === "authorization_code") {
                const code = params.get("code") ?? "";
                const pending = pendingCodes.get(code);
                pendingCodes.delete(code);
                if (!pending) {
                    json(res, 400, { error: "invalid_grant" });
                    return;
                }
                json(res, 200, mint(pending.identity, undefined, pending.nonce));
                return;
            }

            if (grantType === "refresh_token") {
                const parsed = readRefreshToken(params.get("refresh_token") ?? "");
                if (!parsed) {
                    json(res, 400, { error: "invalid_grant" });
                    return;
                }
                json(res, 200, mint(parsed.identity));
                return;
            }

            json(res, 400, { error: "unsupported_grant_type" });
            return;
        }

        if (url.pathname === "/logout") {
            const returnTo =
                url.searchParams.get("post_logout_redirect_uri") ??
                url.searchParams.get("returnTo");
            res.writeHead(302, { location: returnTo ?? "/" });
            res.end();
            return;
        }

        json(res, 404, { error: "not_found", path: url.pathname });
    });

    const port = options.port ?? 0;
    await new Promise<void>((resolve, reject) => {
        server.once("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
                reject(
                    new Error(
                        `Fake IdP port ${port} on ${host} is already in use — most likely a ` +
                            "previous run that did not shut down. Free it, or set E2E_IDP_PORT " +
                            "to another port.",
                    ),
                );
                return;
            }
            reject(error);
        });
        server.listen(port, host, resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Fake IdP failed to bind to a TCP port");
    }
    origin = `http://${host}:${address.port}`;
    issuer = `${origin}/`;

    return {
        origin,
        issuer,
        audience: options.audience,
        clientId: options.clientId,
        mint: (identity, opts) => mint(identity, opts),
        stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}
