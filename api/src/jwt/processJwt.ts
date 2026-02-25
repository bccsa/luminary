import { Logger } from "winston";
import { Uuid } from "../enums";
import * as JWT from "jsonwebtoken";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
import configuration from "../configuration";
import {
    AccessMap,
    PermissionSystem,
} from "../permissions/permissions.service";
import { getGroupNameToIdMap, clearGroupNameCache } from "./groupCache";
import {
    verifyJwtAndMatchProvider,
    clearJwksClients,
    type TrustedProviderShape,
} from "./verifyJwt";

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

export { clearGroupNameCache, clearJwksClients };

export function parseJwtMap(permissionMap: string, logger?: Logger): JwtMap {
    try {
        const map = JSON.parse(permissionMap);
        if (map.groups) {
            for (const key of Object.keys(map.groups)) {
                map.groups[key] = eval(map.groups[key]);
            }
        }
        for (const key of ["userId", "email", "name"]) {
            if (map[key]) map[key] = eval(map[key]);
        }
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
 * Process a JWT token: JWT_MAPPINGS always runs first; when a provider matches, provider claimNamespace/claimMappings
 * supplement it. OIDC standard claims fallback then User doc lookup and memberOf merge.
 */
export async function processJwt(
    jwt: string,
    db: DbService,
    logger?: Logger,
): Promise<JwtUserDetails> {
    const groupSet = new Set<Uuid>();
    let userId: string | undefined;
    let email: string | undefined;
    let name: string | undefined;
    const lastLogin = Date.now();

    if (!jwtMap) {
        const jwtMapEnv = configuration().auth.jwtMappings;
        if (!jwtMapEnv) {
            logger?.error(`JWT_MAPPING environment variable is not set`);
            return { groups: [] };
        }
        jwtMap = parseJwtMap(jwtMapEnv, logger);
    }

    let jwtPayload: JWT.JwtPayload | undefined;
    let matchedProvider: TrustedProviderShape | undefined;

    if (jwt) {
        try {
            const verified = await verifyJwtAndMatchProvider(jwt, db);
            if (verified) {
                jwtPayload = verified.jwtPayload;
                matchedProvider = verified.matchedProvider;
            }
        } catch (err) {
            logger?.error(`Unable to verify JWT`, err);
        }
    }

    try {
        const map = jwtMap as unknown as Record<string, unknown>;

        // Step 1: Always run JWT_MAPPINGS (groups, userId, email, name)
        const groupsMap = map["groups"] as
            | Record<string, (p: JWT.JwtPayload | undefined) => boolean>
            | undefined;
        if (groupsMap) {
            for (const groupId of Object.keys(groupsMap)) {
                if (groupsMap[groupId](jwtPayload)) groupSet.add(groupId);
            }
        }
        const payloadForMapping = jwtPayload ?? ({} as JWT.JwtPayload);
        const userIdFn = map["userId"] as
            | ((p: JWT.JwtPayload) => string)
            | undefined;
        const emailFn = map["email"] as
            | ((p: JWT.JwtPayload) => string)
            | undefined;
        const nameFn = map["name"] as
            | ((p: JWT.JwtPayload) => string)
            | undefined;
        try {
            if (userIdFn) userId = userIdFn(payloadForMapping);
            if (emailFn) email = emailFn(payloadForMapping);
            if (nameFn) name = nameFn(payloadForMapping);
        } catch {
            // JWT_MAPPINGS extractors may assume a specific claim shape (e.g. custom namespace); leave undefined for OIDC fallback
        }

        // Step 2: If a provider matched, layer on provider-specific extraction
        if (matchedProvider && jwtPayload) {
            const ns = matchedProvider.claimNamespace
                ? jwtPayload[matchedProvider.claimNamespace]
                : undefined;

            if (ns && typeof ns === "object") {
                const nsObj = ns as Record<string, unknown>;
                userId = (nsObj.userId as string) ?? userId;
                email =
                    (nsObj.email as string) ?? email ?? jwtPayload.email;
                name =
                    (nsObj.username as string) ??
                    (nsObj.name as string) ??
                    name ??
                    jwtPayload.name;
            }
            email ??= jwtPayload.email;
            name ??= jwtPayload.name;
            userId ??= jwtPayload.sub;

            if (matchedProvider.claimMappings?.length) {
                const groupNameToId = await getGroupNameToIdMap(db);
                const claimSource =
                    (ns && typeof ns === "object"
                        ? ns
                        : jwtPayload) as Record<string, unknown>;

                for (const mapping of matchedProvider.claimMappings) {
                    const claimValue = claimSource[mapping.claim];
                    if (
                        mapping.target === "groups" &&
                        Array.isArray(claimValue)
                    ) {
                        for (const entry of claimValue) {
                            const id = groupNameToId.get(
                                String(entry).toLowerCase(),
                            );
                            if (id) groupSet.add(id);
                        }
                    }
                }
            }
        }

        // Step 3: OIDC standard-claims fallback
        if (jwtPayload) {
            userId ??= jwtPayload.sub;
            email ??= (jwtPayload as Record<string, unknown>).email as
                | string
                | undefined;
        }
    } catch (err) {
        logger?.error(`Unable to get JWT mappings`, err);
        return { groups: [] };
    }

    const userIdStr = userId?.toString();
    const hasLookupKey = userIdStr ?? email;
    let userDocs: UserDto[] = [];

    if (hasLookupKey) {
        const res = await db.getUserByIdOrEmail(
            typeof email === "string" ? email : "",
            userIdStr,
        );
        userDocs = (res.docs ?? []) as UserDto[];
    }

    if (userIdStr ?? email) {
        for (const d of userDocs) {
            const updated = {
                ...d,
                lastLogin,
                ...(userIdStr && { userId: userIdStr }),
                ...(email && { email }),
                ...(name && { name }),
            };
            await db.upsertDoc(updated);
        }
    }

    for (const groupId of userDocs.flatMap((d) => d.memberOf ?? [])) {
        groupSet.add(groupId);
    }

    // OAuthProvider (and other public doc types) always have public view access
    const PUBLIC_USERS_GROUP_ID = "group-public-users";
    groupSet.add(PUBLIC_USERS_GROUP_ID);

    const groups = [...groupSet];
    const finalUserId = (userIdStr ?? email ?? "").toString();
    const accessMap = PermissionSystem.getAccessMap(groups);

    return {
        groups,
        userId: finalUserId,
        email,
        name,
        jwtPayload,
        accessMap,
    };
}
