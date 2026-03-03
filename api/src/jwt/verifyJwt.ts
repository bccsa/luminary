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
>;

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

/**
 * Verify JWT via JWKS against a trusted OAuthProvider. The token's issuer domain
 * must match a configured provider. Returns the verified payload and matched provider.
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
        logger?.warn("JWT missing kid header — cannot verify via JWKS");
        return undefined;
    }

    const kid = decoded.header.kid;
    const payload = decoded.payload as JWT.JwtPayload;
    const iss = payload?.iss;
    if (!iss) {
        logger?.warn("JWT missing issuer claim");
        return undefined;
    }

    let domain: string;
    try {
        domain = new URL(iss).hostname.toLowerCase();
    } catch {
        logger?.warn("JWT issuer is not a valid URL", { iss });
        return undefined;
    }
    if (!domain) return undefined;

    const providerResult = await db.getDocsByType(DocType.OAuthProvider);
    const provider = (providerResult.docs ?? []).find(
        (p: Record<string, unknown>) =>
            String(p.domain ?? "").toLowerCase() === domain,
    ) as TrustedProviderShape | undefined;

    if (!provider) {
        logger?.warn("No OAuthProvider configured for domain", { domain });
        return undefined;
    }

    try {
        const jwtPayload = await verifyJwtWithJwks(jwt, domain, kid);
        return { jwtPayload, matchedProvider: provider };
    } catch (err) {
        logger?.error("JWKS verification failed", {
            domain,
            kid,
            message: err instanceof Error ? err.message : String(err),
        });
        return undefined;
    }
}

export function clearJwksClients() {
    jwksClients.clear();
}
