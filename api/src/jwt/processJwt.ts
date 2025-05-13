import { Logger } from "winston";
import { Uuid } from "../enums";
import * as JWT from "jsonwebtoken";
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
    let jwtPayload: JWT.JwtPayload;
    try {
        jwtPayload = JWT.verify(jwt, process.env.JWT_SECRET) as JWT.JwtPayload;
    } catch (err) {
        logger?.error(`Unable to verify JWT`, err);
    }

    // Get JWT mapped groups and user details
    try {
        if (jwtMap["groups"]) {
            Object.keys(jwtMap["groups"]).forEach((groupId) => {
                if (jwtMap["groups"][groupId](jwtPayload)) groupSet.add(groupId);
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
    } catch (err) {
        logger?.error(`Unable to get JWT mappings`, err);
        return { groups: [] };
    }

    let userDoc: UserDto;

    // If userId is set, get the user details from the database using the userId
    if (userId) {
        userId = userId.toString();
        const d = await db.getUserById(userId);
        if (d && d.docs.length > 0) {
            userDoc = d.docs[0] as UserDto;
        }
    }

    // Get assigned user groups from the database using the email as unique identifier if userId is not set
    if (!userDoc && email) {
        const d = await db.getUserByEmail(email);
        if (d && d.docs.length > 0) {
            userDoc = d.docs[0] as UserDto;
        }
    }

    // Update user details in the database (if changed) if userId is set
    if (userDoc && userId) {
        const updatedUserDoc = { ...userDoc, email };
        if (userId) updatedUserDoc.userId = userId; // This will allow the id of a user to be changed for the same email address. We think that is not a problem, as we trust the authentication provider to prevent duplicate users (by email address)
        if (name) updatedUserDoc.name = name;
        if (
            updatedUserDoc.name !== userDoc.name ||
            updatedUserDoc.email !== userDoc.email ||
            updatedUserDoc.userId !== userDoc.userId
        ) {
            await db.upsertDoc(updatedUserDoc);
        }
    }

    userDoc?.memberOf?.forEach((groupId) => {
        groupSet.add(groupId);
    });

    const groups = [...groupSet];
    const accessMap = PermissionSystem.getAccessMap(groups);

    if (!userId) userId = email || "";
    userId = userId.toString();

    return { groups, userId, email, name, jwtPayload, accessMap };
}
