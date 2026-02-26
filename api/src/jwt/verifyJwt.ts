import { Logger } from "winston";
import { DocType } from "../enums";
import * as JWT from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { DbService } from "../db/db.service";
import type { OAuthProviderDto } from "../dto/OAuthProviderDto";

export type TrustedProviderShape = Pick<
    OAuthProviderDto,
    | "claimNamespace"
    | "claimMappings"
    | "userFieldMappings"
    | "groupAssignments"
    | "isGuestProvider"
>;

/**
 * Get the Guest provider (isGuestProvider === true). Used when no JWT or no domain match.
 * Returns undefined if none configured.
 */
export async function getGuestProvider(
    db: DbService,
): Promise<TrustedProviderShape | undefined> {
    const result = await db.getDocsByType(DocType.OAuthProvider);
    const guest = result.docs?.find(
        (p: Record<string, unknown>) => p.isGuestProvider === true,
    ) as TrustedProviderShape | undefined;
    return guest;
}

const jwksClients = new Map<string, JwksClient>();

function getOrCreateJwksClient(domain: string): JwksClient {
    if (!jwksClients.has(domain)) {
        jwksClients.set(
            domain,
            new JwksClient({
                jwksUri: `https://${domain}/.well-known/jwks.json`,
                cache: true,
                cacheMaxAge: 600000,
                rateLimit: true,
            }),
        );
    }
    return jwksClients.get(domain)!;
}

async function verifyJwtWithJwks(
    token: string,
    domain: string,
    kid: string,
): Promise<JWT.JwtPayload> {
    const client = getOrCreateJwksClient(domain);
    const key = await client.getSigningKey(kid);
    return JWT.verify(token, key.getPublicKey(), {
        algorithms: ["RS256"],
    }) as JWT.JwtPayload;
}

function tryVerifyWithSecret(
    jwt: string,
): { jwtPayload: JWT.JwtPayload } | undefined {
    try {
        const secret = (process.env.JWT_SECRET ?? "").replace(/\\n/g, "\n");
        const jwtPayload = JWT.verify(jwt, secret) as JWT.JwtPayload;
        return { jwtPayload };
    } catch {
        return undefined;
    }
}

/**
 * Verify JWT via JWKS (trusted OIDC provider) or fallback JWT_SECRET. Returns payload and matched provider when applicable.
 */
export async function verifyJwtAndMatchProvider(
    jwt: string,
    db: DbService,
    logger?: Logger,
): Promise<
    | { jwtPayload: JWT.JwtPayload; matchedProvider?: TrustedProviderShape }
    | undefined
> {
    const decoded = JWT.decode(jwt, { complete: true });
    if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
        return tryVerifyWithSecret(jwt);
    }

    const kid = decoded.header.kid;
    const payload = decoded.payload as JWT.JwtPayload;
    const iss = payload?.iss;
    if (!iss) return tryVerifyWithSecret(jwt);

    let domain: string;
    try {
        domain = new URL(iss).hostname.toLowerCase();
    } catch {
        return tryVerifyWithSecret(jwt);
    }
    if (!domain) return tryVerifyWithSecret(jwt);

    const providerResult = await db.getDocsByType(DocType.OAuthProvider);
    const matchingDomain = (providerResult.docs ?? []).filter(
        (p: Record<string, unknown>) =>
            String(p.domain ?? "").toLowerCase() === domain,
    );
    // Prefer non-Guest provider when multiple share the same domain
    const trustedProvider = matchingDomain.find(
        (p: Record<string, unknown>) => !p.isGuestProvider,
    ) ?? matchingDomain[0];
    const provider = trustedProvider as TrustedProviderShape | undefined;

    if (provider) {
        try {
            const jwtPayload = await verifyJwtWithJwks(jwt, domain, kid);
            return { jwtPayload, matchedProvider: provider };
        } catch (err) {
            logger?.warn("JWKS verification failed, falling back to JWT_SECRET", {
                domain,
                kid,
                message: err instanceof Error ? err.message : String(err),
            });
            // fall through to JWT_SECRET
        }
    }

    // No domain match: if JWT verifies with secret, treat as Guest provider so single path
    const secretResult = tryVerifyWithSecret(jwt);
    if (secretResult) {
        const guestProvider = await getGuestProvider(db);
        if (guestProvider) {
            return {
                jwtPayload: secretResult.jwtPayload,
                matchedProvider: guestProvider,
            };
        }
    }
    return secretResult;
}

export function clearJwksClients() {
    jwksClients.clear();
}
