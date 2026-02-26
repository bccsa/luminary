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
    getGuestProvider,
    clearJwksClients,
    type TrustedProviderShape,
} from "./verifyJwt";
import type { GroupAssignmentCondition } from "../dto/OAuthProviderDto";

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

function evaluateGroupCondition(
    condition: GroupAssignmentCondition,
    claimSource: Record<string, unknown> | undefined,
    hasJwt: boolean,
): boolean {
    switch (condition.type) {
        case "always":
            return true;
        case "authenticated":
            return hasJwt;
        case "claimEquals": {
            const v = claimSource?.[condition.claimPath];
            return String(v ?? "") === condition.value;
        }
        case "claimIn": {
            const v = claimSource?.[condition.claimPath];
            const str = v != null ? String(v) : undefined;
            return str != null && condition.values.includes(str);
        }
        default:
            return false;
    }
}

/**
 * Process a JWT token: always resolve to a provider (real or Guest). Apply provider userFieldMappings,
 * groupAssignments (AND conditions), and claimMappings. OIDC fallback then User doc lookup and memberOf merge.
 * When no provider matches and no Guest is configured, falls back to JWT_MAPPINGS env (migration).
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

    let jwtPayload: JWT.JwtPayload | undefined;
    let matchedProvider: TrustedProviderShape | undefined;

    if (jwt) {
        try {
            const verified = await verifyJwtAndMatchProvider(jwt, db, logger);
            if (verified) {
                jwtPayload = verified.jwtPayload;
                matchedProvider = verified.matchedProvider;
            }
        } catch (err) {
            logger?.error(`Unable to verify JWT`, err);
        }
    } else {
        matchedProvider = await getGuestProvider(db);
    }

    const hasProvider = !!matchedProvider;

    try {
        if (hasProvider && matchedProvider) {
            const ns =
                matchedProvider.claimNamespace && jwtPayload
                    ? (jwtPayload[matchedProvider.claimNamespace] as
                          | Record<string, unknown>
                          | undefined)
                    : undefined;
            const claimSource =
                (ns && typeof ns === "object" ? ns : jwtPayload) as
                    | Record<string, unknown>
                    | undefined;

            // User fields from userFieldMappings + claimNamespace
            const mappings = matchedProvider.userFieldMappings;
            if (ns && typeof ns === "object" && mappings) {
                const nsObj = ns as Record<string, unknown>;
                if (mappings.userId) userId = nsObj[mappings.userId] as string;
                if (mappings.email) email = nsObj[mappings.email] as string;
                if (mappings.name) name = nsObj[mappings.name] as string;
            }
            if (jwtPayload) {
                email ??= jwtPayload.email;
                name ??= jwtPayload.name;
                userId ??= jwtPayload.sub;
                email ??= (jwtPayload as Record<string, unknown>).email as
                    | string
                    | undefined;
            }

            // groupAssignments: add group when all conditions pass (AND). Invalid groupIds are no-ops.
            const assignments = matchedProvider.groupAssignments;
            if (assignments?.length) {
                for (const assignment of assignments) {
                    const allPass = assignment.conditions.every((c) =>
                        evaluateGroupCondition(
                            c,
                            claimSource,
                            !!jwtPayload,
                        ),
                    );
                    if (allPass && assignment.groupId)
                        groupSet.add(assignment.groupId as Uuid);
                }
            }

            // claimMappings (claim array → group names)
            if (matchedProvider.claimMappings?.length && claimSource) {
                const groupNameToId = await getGroupNameToIdMap(db);
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
        } else {
            // Fallback: no provider (no Guest configured) — use JWT_MAPPINGS env (migration)
            const jwtMapEnv = configuration().auth?.jwtMappings;
            if (jwtMapEnv) {
                if (!jwtMap) jwtMap = parseJwtMap(jwtMapEnv, logger);
                const map = jwtMap as unknown as Record<string, unknown>;
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
                    // leave undefined for OIDC fallback
                }
            }
            if (jwtPayload) {
                userId ??= jwtPayload.sub;
                email ??= (jwtPayload as Record<string, unknown>).email as
                    | string
                    | undefined;
            }
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

    const PUBLIC_USERS_GROUP_ID = "group-public-users";
    groupSet.add(PUBLIC_USERS_GROUP_ID);

    const groups = [...groupSet];
    const finalUserId = (userIdStr ?? email ?? "").toString();
    logger?.info("processJwt", {
        groupCount: groups.length,
        hasJwtPayload: !!jwtPayload,
        hasMatchedProvider: !!matchedProvider,
    });
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
