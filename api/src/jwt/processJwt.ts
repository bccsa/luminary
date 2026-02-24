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
    /** Human-readable auth processing errors for debugging (surfaced to client). */
    authErrors?: string[];
};

let jwtMap: JwtMap;

// Cache JWKS clients per provider domain to avoid repeated OIDC discovery requests
const jwksClients = new Map<string, JwksClient>();

// Cache group name→ID map to avoid querying the DB on every JWT processing call
const GROUP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let groupNameCache: Map<string, string> | undefined;
let groupCacheTimestamp = 0;

async function getGroupNameToIdMap(
    db: DbService,
): Promise<Map<string, string>> {
    const now = Date.now();
    if (groupNameCache && now - groupCacheTimestamp < GROUP_CACHE_TTL_MS) {
        return groupNameCache;
    }

    const groupDocs = await db.getDocsByType(DocType.Group);
    const map = new Map<string, string>();
    for (const g of groupDocs.docs ?? []) {
        const group = g as Record<string, unknown>;
        if (group.name && group._id) {
            map.set(String(group.name).toLowerCase(), String(group._id));
        }
    }

    groupNameCache = map;
    groupCacheTimestamp = now;
    return map;
}

/**
 * Clear the group name cache. Useful for testing.
 */
export function clearGroupNameCache() {
    groupNameCache = undefined;
    groupCacheTimestamp = 0;
}

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
 * Normalize a domain string for comparison.
 * Strips protocol, trailing slashes, paths, and lowercases.
 * Handles formats like "dev-xxx.us.auth0.com", "https://dev-xxx.us.auth0.com/", etc.
 */
function normalizeDomain(raw: string): string {
    let cleaned = raw
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/+$/, "");

    // If there's still a path (e.g. "domain.com/some/path"), extract just the hostname
    if (cleaned.includes("/")) {
        try {
            cleaned = new URL(`https://${cleaned}`).hostname;
        } catch {
            // Not a valid URL after prepending protocol — use as-is
        }
    }

    return cleaned;
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
    const authErrors: string[] = [];
    let userId: string;
    let email: string;
    let name: string;
    const lastLogin = Date.now();

    // Load the JWT mappings if not already loaded
    if (!jwtMap) {
        const jwtMapEnv = configuration().auth.jwtMappings;
        if (!jwtMapEnv) {
            logger?.error(`JWT_MAPPING environment variable is not set`);
            return {
                groups: [],
                authErrors: ["JWT_MAPPINGS environment variable is not set"],
            };
        }
        jwtMap = parseJwtMap(jwtMapEnv, logger);
    }

    // Verify the JWT token (skip verification if no JWT provided – group mappings still run below)
    let jwtPayload: JWT.JwtPayload;
    let matchedProvider:
        | {
              claimNamespace?: string;
              claimMappings?: Array<{ claim: string; target: string }>;
          }
        | undefined;

    if (jwt) {
        const decoded = JWT.decode(jwt, { complete: true });

        if (decoded && typeof decoded !== "string" && decoded.header.kid) {
            // Token has a key ID – likely signed by an OIDC provider (RS256)
            const kid = decoded.header.kid;
            const payload = decoded.payload as JWT.JwtPayload;
            const iss = payload?.iss;

            if (iss) {
                // Parse the issuer URL to extract the hostname
                let domain: string;
                try {
                    const issuerUrl = new URL(iss);
                    domain = issuerUrl.hostname.toLowerCase();
                } catch {
                    const msg = `Malformed JWT issuer claim: "${iss}"`;
                    logger?.error(msg);
                    authErrors.push(msg);
                    // Skip JWKS verification — will fall through to JWT_SECRET
                    domain = "";
                }

                if (domain) {
                    // Validate this is a trusted provider registered in the database
                    const providerResult = await db.getDocsByType(
                        DocType.OAuthProvider,
                    );

                    const trustedProvider = providerResult.docs?.find(
                        (p: Record<string, unknown>) => {
                            return (
                                normalizeDomain(String(p.domain || "")) ===
                                domain
                            );
                        },
                    );

                    if (trustedProvider) {
                        try {
                            jwtPayload = await verifyJwtWithJwks(
                                jwt,
                                domain,
                                kid,
                            );
                            matchedProvider = trustedProvider as {
                                claimNamespace?: string;
                                claimMappings?: Array<{
                                    claim: string;
                                    target: string;
                                }>;
                            };
                        } catch (err) {
                            const msg = `JWKS verification failed for domain ${domain}: ${
                                err instanceof Error ? err.message : String(err)
                            }`;
                            logger?.error(msg);
                            authErrors.push(msg);
                        }
                    } else {
                        const storedDomains =
                            providerResult.docs
                                ?.map((p: Record<string, unknown>) =>
                                    String(p.domain || ""),
                                )
                                .join(", ") || "(none)";
                        const msg = `No trusted provider found for issuer domain: "${domain}". Stored domains: [${storedDomains}]`;
                        logger?.warn(msg);
                        authErrors.push(msg);
                    }
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
                const msg = `JWT_SECRET verification failed: ${
                    err instanceof Error ? err.message : String(err)
                }`;
                logger?.error(msg);
                authErrors.push(msg);
            }
        }
    }

    // Extract user details and group mappings
    try {
        if (matchedProvider && jwtPayload) {
            // OIDC provider path: extract user details from provider-specific
            // namespace or standard OIDC claims.
            const nsPayload = matchedProvider.claimNamespace
                ? jwtPayload[matchedProvider.claimNamespace]
                : undefined;

            // Extract user details from namespace first, then top-level OIDC claims
            if (nsPayload && typeof nsPayload === "object") {
                userId = nsPayload.userId;
                email = nsPayload.email || jwtPayload.email;
                name = nsPayload.username || nsPayload.name || jwtPayload.name;
            }

            // Standard OIDC claim fallbacks
            if (!email) email = jwtPayload.email;
            if (!name) name = jwtPayload.name;
            if (!userId) userId = jwtPayload.sub;

            // Process generic claim mappings from provider config
            if (matchedProvider.claimMappings?.length) {
                for (const mapping of matchedProvider.claimMappings) {
                    // Read the claim value — check namespace first, then top-level
                    const claimSource = nsPayload ?? jwtPayload;
                    const claimValue = claimSource[mapping.claim];

                    if (
                        mapping.target === "groups" &&
                        Array.isArray(claimValue)
                    ) {
                        // Match claim values against Group document names (cached)
                        const groupNameToId = await getGroupNameToIdMap(db);

                        for (const entry of claimValue) {
                            const groupName = String(entry).toLowerCase();
                            const groupId = groupNameToId.get(groupName);
                            if (groupId) groupSet.add(groupId);
                        }
                    }
                    // Unknown target types are silently skipped (future-proof)
                }
            }
        } else {
            // Legacy / JWT_SECRET path: use global JWT_MAPPINGS functions
            if (jwtMap["groups"]) {
                Object.keys(jwtMap["groups"]).forEach((groupId) => {
                    if (jwtMap["groups"][groupId](jwtPayload))
                        groupSet.add(groupId);
                });
            }

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
    } catch (err) {
        const msg = `User detail extraction failed: ${
            err instanceof Error ? err.message : String(err)
        }`;
        authErrors.push(msg);
        return { groups: [], authErrors };
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

    return {
        groups,
        userId,
        email,
        name,
        jwtPayload,
        accessMap,
        ...(authErrors.length > 0 ? { authErrors } : {}),
    };
}
