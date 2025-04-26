import { Logger } from "winston";
import { Uuid } from "../enums";
import * as JWT from "jsonwebtoken";

export type PermissionMap = Map<string, Map<string, (jwt) => void> | ((jwt) => void)>;

export type JwtUserDetails = {
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
    jwtPayload?: JWT.JwtPayload;
};

let permissionMap: PermissionMap;

/**
 * Parse the permission map from the JWT_MAPPINGS environmental variable to an object
 * @param permissionMap - Configuration instance
 * @returns - Parsed permissions map
 */
export function parseJwtMap(permissionMap: string, logger?: Logger): PermissionMap {
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

        return map as PermissionMap;
    } catch (err) {
        logger?.error(`Unable to parse permission map`, err);
        return new Map();
    }
}

/**
 * Process a JWT token against the JWT_MAPPINGS (environmental variable) and return mapped groups and user details
 * @param jwt - Javascript Web Token
 * @param logger - Logger instance
 * @returns - Array with JWT verified groups
 */
export function processJwt(jwt: string, logger?: Logger): JwtUserDetails {
    // Load the permission map if not already loaded
    if (!permissionMap) {
        const permissionMapEnv = process.env.JWT_MAPPINGS;
        if (!permissionMapEnv) {
            logger?.error(`PERMISSION_MAP environment variable is not set`);
            return { groups: [] };
        }
        permissionMap = parseJwtMap(permissionMapEnv, logger);
    }

    // Verify the JWT token
    let jwtPayload: JWT.JwtPayload;
    try {
        jwtPayload = JWT.verify(jwt, process.env.JWT_SECRET) as JWT.JwtPayload;
    } catch (err) {
        logger?.error(`Unable to verify JWT`, err);
    }

    try {
        const groups = new Array<Uuid>();
        let userId: string;
        let email: string;
        let name: string;

        if (permissionMap["groups"]) {
            Object.keys(permissionMap["groups"]).forEach((groupId) => {
                if (permissionMap["groups"][groupId](jwtPayload)) groups.push(groupId);
            });
        }

        if (permissionMap["userId"]) {
            userId = permissionMap["userId"](jwtPayload);
        }

        if (permissionMap["email"]) {
            email = permissionMap["email"](jwtPayload);
        }

        if (permissionMap["name"]) {
            name = permissionMap["name"](jwtPayload);
        }

        return { groups, userId, email, name, jwtPayload };
    } catch (err) {
        logger?.error(`Unable to get JWT permissions`, err);
        return { groups: [] };
    }
}

// const userMemberOf: Uuid[] = [];
//         if (jwt && (jwt as JWT.JwtPayload).email) {
//             const userDoc = await this.db.getUserByEmail((jwt as JWT.JwtPayload).email);
//             if (userDoc && userDoc.docs.length > 0) {
//                 userMemberOf.push(userDoc.docs[0].groups);
//             }
//         }
