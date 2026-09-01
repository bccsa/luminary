import crypto from "node:crypto";
import type { SigningKey } from "./signingKey";

/**
 * Token minting is kept free of any server dependency so a Playwright worker can
 * produce a token without talking to the running issuer.
 */

function b64url(input: string): string {
    return Buffer.from(input, "utf8").toString("base64url");
}

function sign(key: SigningKey, payload: Record<string, unknown>): string {
    const header = { alg: "RS256", typ: "JWT", kid: key.kid };
    const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(body), key.privateKeyPem);
    return `${body}.${signature.toString("base64url")}`;
}

export type TokenIdentity = {
    sub: string;
    email?: string;
    name?: string;
    /** Extra claims, e.g. the roles an AutoGroupMappings condition matches on. */
    claims?: Record<string, unknown>;
};

export type MintOptions = {
    key: SigningKey;
    /** Must match the API's expected `iss` exactly, trailing slash included. */
    issuer: string;
    audience: string;
    clientId: string;
    identity: TokenIdentity;
    expiresInSeconds?: number;
    issuedAt?: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60;

function baseClaims(o: MintOptions) {
    const iat = o.issuedAt ?? Math.floor(Date.now() / 1000);
    return { iat, exp: iat + (o.expiresInSeconds ?? DEFAULT_TTL_SECONDS), iss: o.issuer };
}

/**
 * The token the clients put in `Authorization`. `azp` carries the client id
 * because the API cross-checks it against the AuthProvider doc.
 */
export function mintAccessToken(o: MintOptions): string {
    const { identity } = o;
    return sign(o.key, {
        ...baseClaims(o),
        sub: identity.sub,
        aud: o.audience,
        azp: o.clientId,
        scope: "openid profile email offline_access",
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.name ? { name: identity.name } : {}),
        ...identity.claims,
    });
}

export function mintIdToken(o: MintOptions & { nonce?: string }): string {
    const { identity } = o;
    return sign(o.key, {
        ...baseClaims(o),
        sub: identity.sub,
        aud: o.clientId,
        ...(o.nonce ? { nonce: o.nonce } : {}),
        ...(identity.email ? { email: identity.email, email_verified: true } : {}),
        ...(identity.name ? { name: identity.name } : {}),
        ...identity.claims,
    });
}

/**
 * Opaque to the clients, but self-describing so the `/token` endpoint can
 * re-mint for the same identity without server-side session storage.
 */
export function mintRefreshToken(o: MintOptions): string {
    return b64url(JSON.stringify({ identity: o.identity, clientId: o.clientId }));
}

export function readRefreshToken(
    token: string,
): { identity: TokenIdentity; clientId: string } | null {
    try {
        const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
        if (parsed && typeof parsed.clientId === "string" && parsed.identity?.sub) return parsed;
    } catch {
        // Anything unparseable is simply not one of ours.
    }
    return null;
}

export type TokenSet = {
    access_token: string;
    id_token: string;
    refresh_token: string;
    token_type: "Bearer";
    scope: string;
    expires_in: number;
    /** Epoch seconds, matching the shape oidc-client-ts persists. */
    expires_at: number;
};

export function mintTokenSet(o: MintOptions & { nonce?: string }): TokenSet {
    const iat = o.issuedAt ?? Math.floor(Date.now() / 1000);
    const ttl = o.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
    const opts = { ...o, issuedAt: iat, expiresInSeconds: ttl };
    return {
        access_token: mintAccessToken(opts),
        id_token: mintIdToken(opts),
        refresh_token: mintRefreshToken(opts),
        token_type: "Bearer",
        scope: "openid profile email offline_access",
        expires_in: ttl,
        expires_at: iat + ttl,
    };
}
