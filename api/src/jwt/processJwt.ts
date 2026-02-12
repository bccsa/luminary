import { Logger } from "winston";
import { Uuid } from "../enums";
import * as JWT from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
import configuration from "../configuration";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";

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

    // Verify the JWT token
    // Verify the JWT token
    let jwtPayload: JWT.JwtPayload;
    if (jwt) {
        try {
            // Decode first to check algorithm and issuer
            const decoded = JWT.decode(jwt, { complete: true });
            if (!decoded || typeof decoded === "string") {
                throw new Error("Invalid token format");
            }

            const alg = decoded.header.alg;

            if (alg === "RS256") {
                // For RS256, we need to fetch the key from the issuer's JWKS
                const issuer = (decoded.payload as JWT.JwtPayload).iss;
                if (!issuer) {
                    throw new Error("Issuer (iss) claim missing from RS256 token");
                }

                // Ensure issuer ends with a slash for constructing the JWKS URI correctly
                const normalizedIssuer = issuer.endsWith("/") ? issuer : `${issuer}/`;
                const jwksUri = `${normalizedIssuer}.well-known/jwks.json`;

                const client = new JwksClient({
                    jwksUri,
                    cache: true,
                    rateLimit: true,
                });

                const key = await new Promise<string>((resolve, reject) => {
                    client.getSigningKey(decoded.header.kid, (err, key) => {
                        if (err) return reject(err);
                        const signingKey = key?.getPublicKey();
                        resolve(signingKey || "");
                    });
                });

                jwtPayload = JWT.verify(jwt, key, { algorithms: ["RS256"] }) as JWT.JwtPayload;
            } else {
                // Default to HS256 with static secret (legacy/local tokens)
                jwtPayload = JWT.verify(jwt, process.env.JWT_SECRET) as JWT.JwtPayload;
            }
        } catch (err) {
            logger?.error(`Unable to verify JWT: ${err.message}`, err);
            // Fall through to return guest access (empty groups)
        }
    }

    // Get JWT mapped groups and user details
    if (jwtPayload) {
        try {
            if (jwtMap["groups"]) {
                Object.keys(jwtMap["groups"]).forEach((groupId) => {
                    try {
                        if (jwtMap["groups"][groupId](jwtPayload)) groupSet.add(groupId);
                    } catch (e) {
                        // Ignore mapping errors for groups
                    }
                });
            }

            if (jwtMap["userId"]) {
                try {
                    userId = jwtMap["userId"](jwtPayload);
                } catch (e) {
                    // Verified Auth0 tokens use 'sub' as the user ID
                    if (jwtPayload.sub) {
                        userId = jwtPayload.sub;
                    } else {
                        logger?.warn(
                            `Failed to map userId from JWT and no 'sub' claim found: ${e.message}`,
                        );
                    }
                }
            } else if (jwtPayload.sub) {
                // Default to sub if no mapping provided
                userId = jwtPayload.sub;
            }

            if (jwtMap["email"]) {
                try {
                    email = jwtMap["email"](jwtPayload);
                } catch (e) {
                    if (jwtPayload.email) email = jwtPayload.email;
                }
            } else if (jwtPayload.email) {
                email = jwtPayload.email;
            }

            if (jwtMap["name"]) {
                try {
                    name = jwtMap["name"](jwtPayload);
                } catch (e) {
                    if (jwtPayload.name) name = jwtPayload.name;
                }
            } else if (jwtPayload.name) {
                name = jwtPayload.name;
            }
        } catch (err) {
            logger?.error(`Unable to get JWT mappings`, err);
        }
    }

    // If userId is set, get the user details from the database using the userId
    if (userId) {
        userId = userId.toString();
    }

    const userDocs = (await db.getUserByIdOrEmail(email, userId)).docs as UserDto[];

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
