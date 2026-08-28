import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** RS256 keypair the fake issuer signs with, plus the public half in JWKS form. */
export type SigningKey = {
    kid: string;
    privateKeyPem: string;
    publicJwk: { kty: string; n: string; e: string; kid: string; use: "sig"; alg: "RS256" };
};

/**
 * Derived from the public modulus so a persisted key always yields the same
 * `kid` — the API caches JWKS per domain and matches tokens on it.
 */
function keyId(privateKeyPem: string): string {
    const jwk = crypto.createPublicKey(privateKeyPem).export({ format: "jwk" });
    return crypto.createHash("sha256").update(`${jwk.n}.${jwk.e}`).digest("base64url").slice(0, 16);
}

function publicJwkOf(privateKeyPem: string, kid: string): SigningKey["publicJwk"] {
    const jwk = crypto.createPublicKey(privateKeyPem).export({ format: "jwk" }) as {
        kty: string;
        n: string;
        e: string;
    };
    return { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, use: "sig", alg: "RS256" };
}

export function createSigningKey(): SigningKey {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const kid = keyId(privateKeyPem);
    return { kid, privateKeyPem, publicJwk: publicJwkOf(privateKeyPem, kid) };
}

/**
 * The issuer process and the test workers are separate processes but must agree
 * on the key, so it is persisted rather than generated per process.
 */
export function loadOrCreateSigningKey(filePath: string): SigningKey {
    if (fs.existsSync(filePath)) {
        const { privateKeyPem } = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const kid = keyId(privateKeyPem);
        return { kid, privateKeyPem, publicJwk: publicJwkOf(privateKeyPem, kid) };
    }

    const key = createSigningKey();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ privateKeyPem: key.privateKeyPem }), {
        mode: 0o600,
    });
    return key;
}
