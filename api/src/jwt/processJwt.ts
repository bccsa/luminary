import { Logger } from "winston";
import { Uuid } from "../enums";
import * as JWT from "jsonwebtoken";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
import configuration from "../configuration";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";
import { OAuthProviderCache, CachedOAuthProvider } from "../auth/oauthProviderCache";

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

/** Group ID for unauthenticated/public access (no or invalid JWT). */
const PUBLIC_GROUP_ID = "group-public-users" as Uuid;

function publicUserDetails(): JwtUserDetails {
    const groups = [PUBLIC_GROUP_ID];
    return { groups, accessMap: PermissionSystem.getAccessMap(groups) };
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
 * Process a JWT token against the JWT_MAPPINGS (environmental variable) and return mapped groups and user details
 * @param jwt - Javascript Web Token
 * @param logger - Logger instance
 * @returns - Array with JWT verified groups
 */
export async function processJwt(
    token: string,
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
            return publicUserDetails();
        }
        jwtMap = parseJwtMap(jwtMapEnv, logger);
    }

    let jwtPayload: JWT.JwtPayload;
    let matchedProvider: CachedOAuthProvider | undefined;

    // Verify token against the cached OAuth provider's signing certificate
    try {
        const decoded = JWT.decode(token, { complete: true });
        if (!decoded?.payload || typeof decoded.payload === "string") {
            return publicUserDetails();
        }

        const iss = (decoded.payload as JWT.JwtPayload).iss;
        if (!iss) return publicUserDetails();

        const provider = OAuthProviderCache.getByIssuer(iss);
        if (!provider) {
            logger?.warn(`No cached OAuth provider matches issuer "${iss}"`);
            return publicUserDetails();
        }

        const kid = decoded.header?.kid;
        const pem = OAuthProviderCache.getSigningKey(provider, kid);
        if (!pem) {
            logger?.warn(`No signing key found for provider "${provider.domain}" (kid=${kid})`);
            return publicUserDetails();
        }

        jwtPayload = JWT.verify(token, pem, { algorithms: ["RS256"] }) as JWT.JwtPayload;
        matchedProvider = provider;
    } catch (err) {
        logger?.error(`Unable to verify JWT`, err);
        return publicUserDetails();
    }

    // Extract user details: use provider's claimNamespace if available, otherwise global jwtMap
    try {
        // Group mappings always use the global jwtMap
        if (jwtMap["groups"]) {
            Object.keys(jwtMap["groups"]).forEach((groupId) => {
                if (jwtMap["groups"][groupId](jwtPayload)) groupSet.add(groupId);
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
    } catch (err) {
        logger?.error(`Unable to get JWT mappings`, err);
        return publicUserDetails();
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
