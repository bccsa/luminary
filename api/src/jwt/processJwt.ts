import { Logger } from "winston";
import { DocType, Uuid } from "../enums";
import * as JWT from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
import configuration from "../configuration";
import {
    AccessMap,
    PermissionSystem,
} from "../permissions/permissions.service";

export type JwtMap = Map<string, Map<string, (jwt) => void> | ((jwt) => void)>;

export type JwtUserDetails = {
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
    jwtPayload?: JWT.JwtPayload;
    accessMap?: AccessMap;
};

let jwtMap: JwtMap;

// Cache JWKS clients per provider domain to avoid repeated OIDC discovery requests
const jwksClients = new Map<string, JwksClient>();

function getOrCreateJwksClient(domain: string): JwksClient {
    if (!jwksClients.has(domain)) {
        jwksClients.set(
            domain,
            new JwksClient({
                jwksUri: `https://${domain}/.well-known/jwks.json`,
                cache: true,
                cacheMaxAge: 600000, // 10 minutes
                rateLimit: true,
            }),
        );
    }
    return jwksClients.get(domain)!;
}

/**
 * Verify a JWT using the JWKS endpoint of a trusted OIDC provider.
 */
async function verifyJwtWithJwks(
    token: string,
    domain: string,
    kid: string,
): Promise<JWT.JwtPayload> {
    const client = getOrCreateJwksClient(domain);
    const key = await client.getSigningKey(kid);
    const publicKey = key.getPublicKey();
    return JWT.verify(token, publicKey, {
        algorithms: ["RS256"],
    }) as JWT.JwtPayload;
}

/**
 * Parse the permission map from the JWT_MAPPINGS environmental variable to an object
 * @param permissionMap - Configuration instance
 * @returns - Parsed permissions map
 */
export function parseJwtMap(permissionMap: string, logger?: Logger): JwtMap {
    // Parse permission map
    try {
        const map = JSON.parse(permissionMap);

        // Evaluate stringified functions
        if (map.groups) {
            Object.keys(map.groups).forEach((key) => {
                map.groups[key] = eval(map.groups[key]);
            });
        }

        if (map.userId) map.userId = eval(map.userId);
        if (map.email) map.email = eval(map.email);
        if (map.name) map.name = eval(map.name);

        return map as JwtMap;
    } catch (err) {
        logger?.error(`Unable to parse permission map`, err);
        return new Map();
    }
}

/**
 * Clear the JWT map. This is useful for testing purposes to ensure that the JWT map is reloaded
 * @returns - void
 */
export function clearJwtMap() {
    jwtMap = undefined;
}

/**
 * Clear the JWKS client cache. Useful for testing.
 */
export function clearJwksClients() {
    jwksClients.clear();
}

/**
 * Process a JWT token against the JWT_MAPPINGS (environmental variable) and return mapped groups and user details
 * @param jwt - Javascript Web Token
 * @param logger - Logger instance
 * @returns - Array with JWT verified groups
 */
export async function processJwt(
    jwt: string,
    db: DbService,
    logger?: Logger,
): Promise<JwtUserDetails> {
    const groupSet = new Set<Uuid>();
    let userId: string;
    let email: string;
    let name: string;
    const lastLogin = Date.now();

    // Load the JWT mappings if not already loaded
    if (!jwtMap) {
        const jwtMapEnv = configuration().auth.jwtMappings;
        if (!jwtMapEnv) {
            logger?.error(`JWT_MAPPING environment variable is not set`);
            return { groups: [] };
        }
        jwtMap = parseJwtMap(jwtMapEnv, logger);
    }

    // Verify the JWT token (skip verification if no JWT provided – group mappings still run below)
    let jwtPayload: JWT.JwtPayload;
    let matchedProvider: { claimNamespace?: string } | undefined;

    if (jwt) {
        const decoded = JWT.decode(jwt, { complete: true });

        if (decoded && typeof decoded !== "string" && decoded.header.kid) {
            // Token has a key ID – likely signed by an OIDC provider (RS256)
            const kid = decoded.header.kid;
            const payload = decoded.payload as JWT.JwtPayload;
            const iss = payload?.iss;

            if (iss) {
                const issuerUrl = new URL(iss);
                const domain = issuerUrl.hostname;

                // Validate this is a trusted provider registered in the database
                const providerResult = await db.getDocsByType(
                    DocType.OAuthProvider,
                );
                const trustedProvider = providerResult.docs?.find(
                    (p: Record<string, unknown>) => {
                        // Normalize the stored domain: strip protocol and trailing slashes
                        // to handle both "dev-xxx.us.auth0.com" and "https://dev-xxx.us.auth0.com/"
                        const storedDomain = String(p.domain || "")
                            .replace(/^https?:\/\//, "")
                            .replace(/\/+$/, "");
                        return storedDomain === domain;
                    },
                );

                if (trustedProvider) {
                    try {
                        jwtPayload = await verifyJwtWithJwks(jwt, domain, kid);
                        matchedProvider = trustedProvider as {
                            claimNamespace?: string;
                        };
                    } catch (err) {
                        // TODO: Remove debug logging after fixing auth issue
                        logger?.error(
                            `JWKS verification failed for domain ${domain}, kid ${kid}:`,
                            err,
                        );
                        console.error(`[DEBUG] JWKS verification failed:`, err);
                    }
                } else {
                    // TODO: Remove debug logging after fixing auth issue
                    logger?.warn(
                        `No trusted provider found for domain: ${domain}`,
                    );
                    console.warn(
                        `[DEBUG] No trusted provider for domain: ${domain}`,
                    );
                }
            }
        }

        // Fall back to static JWT_SECRET (for legacy / symmetric-key tokens)
        if (!jwtPayload) {
            try {
                // Convert literal '\n' escape sequences to real newlines
                // so PEM certificates from .env files are parsed correctly
                const secret = (process.env.JWT_SECRET || "").replace(
                    /\\n/g,
                    "\n",
                );
                jwtPayload = JWT.verify(jwt, secret) as JWT.JwtPayload;
            } catch (err) {
                // TODO: Remove debug logging after fixing auth issue
                logger?.error(`JWT_SECRET verification also failed:`, err);
                console.error(`[DEBUG] JWT_SECRET fallback failed:`, err);
            }
        }
    }

    // Extract user details: use provider's claimNamespace if available, otherwise global jwtMap
    try {
        // Group mappings always use the global jwtMap
        if (jwtMap["groups"]) {
            Object.keys(jwtMap["groups"]).forEach((groupId) => {
                if (jwtMap["groups"][groupId](jwtPayload))
                    groupSet.add(groupId);
            });
        }

        if (matchedProvider?.claimNamespace && jwtPayload) {
            // Extract claims from the provider-specific namespace
            const ns = jwtPayload[matchedProvider.claimNamespace];
            if (ns && typeof ns === "object") {
                userId = ns.userId;
                email = ns.email || jwtPayload.email;
                name = ns.username || ns.name || jwtPayload.name;
            }
            // Standard OIDC claim fallbacks
            if (!email) email = jwtPayload.email;
            if (!name) name = jwtPayload.name;
            if (!userId) userId = jwtPayload.sub;
        } else {
            // Fallback: use global JWT_MAPPINGS functions
            if (jwtMap["userId"]) {
                userId = jwtMap["userId"](jwtPayload);
            }

            if (jwtMap["email"]) {
                email = jwtMap["email"](jwtPayload);
            }

            if (jwtMap["name"]) {
                name = jwtMap["name"](jwtPayload);
            }
        }
    } catch {
        return { groups: [] };
    }

    // If userId is set, get the user details from the database using the userId
    if (userId) {
        userId = userId.toString();
    }

    const userDocs = (await db.getUserByIdOrEmail(email, userId))
        .docs as UserDto[];

    // Update user details in the database if either userId or email is set
    if (userId) {
        for (const d of userDocs) {
            // Only update userId if it was actually mapped from JWT (not email fallback)
            const updated = { ...d, userId, lastLogin };
            // Update email if it was mapped from JWT
            if (email) {
                updated.email = email;
            }
            // Update name if it was mapped from JWT
            if (name) {
                updated.name = name;
            }
            await db.upsertDoc(updated);
        }
    } else if (email) {
        for (const d of userDocs) {
            // When signing in with email only, don't update userId field
            const updated = { ...d, lastLogin, email };
            // Update name if it was mapped from JWT
            if (name) {
                updated.name = name;
            }
            await db.upsertDoc(updated);
        }
    }

    userDocs
        .map((d) => d.memberOf)
        .flat()
        .forEach((groupId) => {
            groupSet.add(groupId);
        });

    const groups = [...groupSet];
    const accessMap = PermissionSystem.getAccessMap(groups);

    if (!userId) userId = email || "";
    userId = userId.toString();

    return { groups, userId, email, name, jwtPayload, accessMap };
}
