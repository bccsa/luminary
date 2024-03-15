import { Uuid } from "../enums";
import * as JWT from "jsonwebtoken";

export type PermissionMap = {
    jwt: Map<string, Map<string, (jwt) => void>>;
};

export type jwtPermissions = {
    groups: Array<Uuid>;
    userId?: Uuid;
};

/**
 * Parse the permission map from the PROCESS_MAP environmental variable to an object
 * @param permissionMap - Configuration instance
 * @returns - Parsed permissions map
 */
export function parsePermissionMap(permissionMap: string): PermissionMap {
    // Parse permission map
    try {
        const map = JSON.parse(permissionMap);

        // Evaluate stringified functions
        if (map.jwt && map.jwt.groups) {
            Object.keys(map.jwt.groups).forEach((key) => {
                map.jwt.groups[key] = eval(map.jwt.groups[key]);
            });
        }
        if (map.jwt && map.jwt.userId) {
            Object.keys(map.jwt.userId).forEach((key) => {
                map.jwt.userId[key] = eval(map.jwt.userId[key]);
            });
        }

        return map as PermissionMap;
    } catch (err) {
        // TODO: Add error logging provider
        console.log(err.message);
    }
}

/**
 * Check a Javascript Web Token against the permission map
 * @param jwt - Javascript Web Token
 * @param permissionMap
 * @returns - Array with JWT verified groups
 */
export function getJwtPermission(
    jwt: string | JWT.JwtPayload,
    permissionMap: PermissionMap,
): jwtPermissions {
    try {
        const groups = new Array<Uuid>();
        let userId: Uuid;

        if (permissionMap && permissionMap.jwt && permissionMap.jwt["groups"]) {
            Object.keys(permissionMap.jwt["groups"]).forEach((groupId) => {
                if (permissionMap.jwt["groups"][groupId](jwt)) groups.push(groupId);
            });
        }

        if (permissionMap && permissionMap.jwt && permissionMap.jwt["userId"]) {
            Object.keys(permissionMap.jwt["userId"]).forEach((id) => {
                if (permissionMap.jwt["userId"][id](jwt)) userId = id;
            });
        }

        return { userId, groups };
    } catch (err) {
        // TODO: Add error logging provider
        console.log(err.message);
        return { groups: [] };
    }
}
