import { Logger } from "winston";
import * as crypto from "crypto";
import { DbService } from "../db/db.service";
import { DocType, Uuid } from "../enums";
import { OAuthProviderDto } from "../dto/OAuthProviderDto";

export type CachedOAuthProvider = {
    providerId: Uuid;
    providerType: string;
    domain: string;
    clientId: string;
    audience: string;
    issuer: string;
    claimNamespace?: string;
    /** PEM-encoded signing keys keyed by `kid`. Used for JWT.verify(). */
    signingKeys: Map<string, string>;
};

/**
 * Normalize an issuer string to a canonical form for consistent Map lookups.
 * Auth0 tokens use `https://<domain>/` as the `iss` claim.
 */
function normalizeIssuer(raw: string): string {
    let iss = raw.trim().toLowerCase();
    if (!iss.startsWith("https://") && !iss.startsWith("http://")) {
        iss = `https://${iss}`;
    }
    if (!iss.endsWith("/")) iss += "/";
    return iss;
}

/**
 * Fetch the JWKS from a provider's well-known endpoint and convert
 * each signing key (use=sig) to a PEM string using Node's built-in crypto.
 * Returns a Map of kid → PEM.
 */
async function fetchSigningKeys(domain: string): Promise<Map<string, string>> {
    const keys = new Map<string, string>();
    const jwksUrl = `https://${domain}/.well-known/jwks.json`;

    const res = await fetch(jwksUrl);
    if (!res.ok) {
        throw new Error(`JWKS fetch failed: ${res.status} ${res.statusText}`);
    }

    const jwks = (await res.json()) as { keys: Array<Record<string, unknown>> };

    for (const jwk of jwks.keys) {
        if (jwk.use && jwk.use !== "sig") continue;

        const kid = (jwk.kid as string) ?? "default";
        const publicKey = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" });
        const pem = publicKey.export({ type: "spki", format: "pem" }) as string;
        keys.set(kid, pem);
    }

    return keys;
}

const cache = new Map<string, CachedOAuthProvider>();

export class OAuthProviderCache {
    /**
     * Load all OAuth providers from the database, fetch their JWKS signing
     * certificates, and cache them in memory keyed by normalised issuer.
     * Must be called (and awaited) before the server starts listening.
     */
    static async init(db: DbService, logger?: Logger): Promise<void> {
        cache.clear();

        const result = await db.getDocsByType(DocType.OAuthProvider);
        const providers = (result.docs || []) as OAuthProviderDto[];

        for (const provider of providers) {
            if (!provider.domain || !provider.clientId) {
                logger?.warn(
                    `Skipping OAuth provider ${provider._id}: missing domain or clientId`,
                );
                continue;
            }

            try {
                const signingKeys = await fetchSigningKeys(provider.domain);

                if (signingKeys.size === 0) {
                    logger?.warn(
                        `No signing keys found for OAuth provider ${provider._id} (${provider.domain})`,
                    );
                    continue;
                }

                const issuer = normalizeIssuer(provider.domain);

                cache.set(issuer, {
                    providerId: provider._id,
                    providerType: provider.providerType ?? "auth0",
                    domain: provider.domain,
                    clientId: provider.clientId,
                    audience: provider.audience ?? "",
                    issuer,
                    claimNamespace: provider.claimNamespace,
                    signingKeys,
                });

                logger?.info(
                    `Cached OAuth provider "${provider.label}" (${issuer}) with ${signingKeys.size} signing key(s)`,
                );
            } catch (err) {
                logger?.warn(
                    `Failed to fetch signing keys for OAuth provider ${provider._id} (${provider.domain}): ${err.message}`,
                );
            }
        }
    }

    /** Look up a cached provider by the `iss` claim from a JWT. */
    static getByIssuer(iss: string): CachedOAuthProvider | undefined {
        return cache.get(normalizeIssuer(iss));
    }

    /**
     * Get the PEM signing key for a provider, matched by `kid` from the JWT header.
     * Falls back to the first available key if `kid` is not found.
     */
    static getSigningKey(provider: CachedOAuthProvider, kid?: string): string | undefined {
        if (kid && provider.signingKeys.has(kid)) {
            return provider.signingKeys.get(kid);
        }
        const first = provider.signingKeys.values().next();
        return first.done ? undefined : first.value;
    }

    /** Return all cached providers. */
    static getAll(): CachedOAuthProvider[] {
        return [...cache.values()];
    }

    /** Clear the in-memory cache (useful for tests). */
    static clearCache(): void {
        cache.clear();
    }
}
