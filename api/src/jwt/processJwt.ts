import { Logger } from "winston";
import { Uuid } from "../enums";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
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
import type { GroupAssignmentCondition } from "../dto/OAuthProviderDto";
import type { JwtPayload } from "jsonwebtoken";

export type JwtUserDetails = {
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
    jwtPayload?: JwtPayload;
    accessMap?: AccessMap;
};

export { clearGroupNameCache, clearJwksClients };

const PUBLIC_USERS_GROUP_ID = "group-public-users";

// --- Helpers ---

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

/** Extract userId, email, name from the JWT payload using the provider's field mappings. */
function extractUserFields(
    provider: TrustedProviderShape,
    jwtPayload: JwtPayload,
): { userId?: string; email?: string; name?: string } {
    const ns = provider.claimNamespace
        ? (jwtPayload[provider.claimNamespace] as
              | Record<string, unknown>
              | undefined)
        : undefined;

    let userId: string | undefined;
    let email: string | undefined;
    let name: string | undefined;

    // Try custom field mappings from the namespace object first
    const mappings = provider.userFieldMappings;
    if (ns && typeof ns === "object" && mappings) {
        if (mappings.userId) userId = ns[mappings.userId] as string;
        if (mappings.email) email = ns[mappings.email] as string;
        if (mappings.name) name = ns[mappings.name] as string;
    }

    // Fall back to standard OIDC claims
    email ??= jwtPayload.email;
    name ??= jwtPayload.name;
    userId ??= jwtPayload.sub;

    return { userId, email, name };
}

/** Resolve groups from provider groupAssignments and claimMappings. */
async function resolveProviderGroups(
    provider: TrustedProviderShape,
    jwtPayload: JwtPayload,
    db: DbService,
): Promise<Set<Uuid>> {
    const groupSet = new Set<Uuid>();

    const ns = provider.claimNamespace
        ? (jwtPayload[provider.claimNamespace] as
              | Record<string, unknown>
              | undefined)
        : undefined;
    const claimSource = (ns && typeof ns === "object" ? ns : jwtPayload) as
        | Record<string, unknown>
        | undefined;

    // Static/conditional group assignments
    if (provider.groupAssignments?.length) {
        for (const assignment of provider.groupAssignments) {
            const allPass = assignment.conditions.every((c) =>
                evaluateGroupCondition(c, claimSource, true),
            );
            if (allPass && assignment.groupId) {
                groupSet.add(assignment.groupId as Uuid);
            }
        }
    }

    // Claim-based group mappings (claim array values → group names → group IDs)
    if (provider.claimMappings?.length && claimSource) {
        const groupNameToId = await getGroupNameToIdMap(db);
        for (const mapping of provider.claimMappings) {
            const claimValue = claimSource[mapping.claim];
            if (mapping.target === "groups" && Array.isArray(claimValue)) {
                for (const entry of claimValue) {
                    const id = groupNameToId.get(String(entry).toLowerCase());
                    if (id) groupSet.add(id);
                }
            }
        }
    }

    return groupSet;
}

// --- Main ---

/**
 * Verify a JWT, resolve user identity and group memberships, and return
 * the combined access details. Unauthenticated requests get public access only.
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
    let jwtPayload: JwtPayload | undefined;

    // 1. Verify JWT and match to a provider
    if (jwt) {
        try {
            const verified = await verifyJwtAndMatchProvider(jwt, db, logger);
            if (verified) {
                jwtPayload = verified.jwtPayload;
                const provider = verified.matchedProvider;

                if (provider && jwtPayload) {
                    ({ userId, email, name } = extractUserFields(
                        provider,
                        jwtPayload,
                    ));

                    const providerGroups = await resolveProviderGroups(
                        provider,
                        jwtPayload,
                        db,
                    );
                    for (const g of providerGroups) groupSet.add(g);
                }
            }
        } catch (err) {
            logger?.error("Unable to verify JWT", err);
        }
    }

    // 2. Merge groups from existing User docs in the database
    const userIdStr = userId?.toString();
    if (userIdStr ?? email) {
        const res = await db.getUserByIdOrEmail(
            typeof email === "string" ? email : "",
            userIdStr,
        );
        const userDocs = (res.docs ?? []) as UserDto[];

        // Update user records with latest login info
        for (const doc of userDocs) {
            await db.upsertDoc({
                ...doc,
                lastLogin: Date.now(),
                ...(userIdStr && { userId: userIdStr }),
                ...(email && { email }),
                ...(name && { name }),
            });

            for (const groupId of doc.memberOf ?? []) {
                groupSet.add(groupId);
            }
        }
    }

    // 3. Everyone gets public access
    groupSet.add(PUBLIC_USERS_GROUP_ID);

    const groups = [...groupSet];
    const accessMap = PermissionSystem.getAccessMap(groups);

    return {
        groups,
        userId: (userIdStr ?? email ?? "").toString(),
        email,
        name,
        jwtPayload,
        accessMap,
    };
}
