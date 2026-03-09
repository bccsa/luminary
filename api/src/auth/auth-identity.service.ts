import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtPayload } from "jsonwebtoken";
import { DbService } from "../db/db.service";
import { DocType } from "../enums";
import { GroupAssignment, GroupAssignmentCondition, OAuthProviderDto } from "../dto/OAuthProviderDto";
import { UserDto } from "../dto/UserDto";

/**
 * The resolved identity returned after JWT processing.
 * Attach this to the request object so downstream handlers can read user + groups.
 */
export type ResolvedIdentity = {
    user: UserDto;
    /** Effective group IDs: union of provider-derived groups and user.memberOf. Falls back to the guest group. */
    groupIds: string[];
};

/** Fallback group assigned when no groupAssignment conditions match. */
const GUEST_GROUP_ID = "group-public-users";

@Injectable()
export class AuthIdentityService {
    constructor(private readonly db: DbService) {}

    /**
     * Main entry point.  Given a verified JWT payload and the matching OAuthProvider document,
     * resolves the user identity and evaluates all groupAssignment rules.
     *
     * Effective groupIds = union of user.memberOf (DB-assigned) and provider-derived groups.
     */
    async resolveIdentity(payload: JwtPayload, provider: OAuthProviderDto): Promise<ResolvedIdentity> {
        const { userId, email, name } = this.extractUserFields(payload, provider);
        const user = await this.findUser({ userId, email, name, providerId: provider._id });
        const providerGroupIds = this.evaluateGroupAssignments(payload, provider.groupAssignments ?? []);

        // Merge DB-assigned groups with provider-derived groups
        const groupIds = [...new Set([...(user.memberOf ?? []), ...providerGroupIds])];

        return { user, groupIds };
    }

    // -------------------------------------------------------------------------
    // Identity resolution
    // -------------------------------------------------------------------------

    /**
     * Extracts userId, email, and name from the JWT payload using the provider's
     * claimNamespace and userFieldMappings configuration.
     *
     * Auth0 supports two namespacing conventions:
     *   1. Nested object:  payload["https://ns.example.com"] = { userId, email, name }
     *   2. Flat prefix:    payload["https://ns.example.com/userId"] = "value"
     *
     * Both are tried; the nested form takes precedence.
     */
    private extractUserFields(
        payload: JwtPayload,
        provider: OAuthProviderDto,
    ): { userId: string; email: string; name: string } {
        const mappings = provider.userFieldMappings ?? {};
        const ns = provider.claimNamespace;

        const get = (fieldName: string | undefined): string => {
            if (!fieldName) return "";

            // 1. Try namespaced nested object: payload[ns][fieldName]
            if (ns) {
                const nsObj = payload[ns];
                if (nsObj && typeof nsObj === "object" && !Array.isArray(nsObj)) {
                    const val = (nsObj as Record<string, unknown>)[fieldName];
                    if (typeof val === "string" && val) return val;
                }

                // 2. Try flat namespaced key: payload["ns/fieldName"]
                const flatKey = `${ns}/${fieldName}`;
                const flatVal = payload[flatKey];
                if (typeof flatVal === "string" && flatVal) return flatVal;
            }

            // 3. Fall back to top-level key (e.g. standard JWT claims like "sub", "email")
            const topVal = payload[fieldName];
            if (typeof topVal === "string" && topVal) return topVal;

            return "";
        };

        return {
            userId: get(mappings.userId) || (payload.sub ?? ""),
            email:  get(mappings.email),
            name:   get(mappings.name),
        };
    }

    /**
     * Resolves a user by (providerId, userId) using the new providerIdentifiers structure,
     * with a fallback to the legacy oAuthProviderId + userId compound key.
     *
     * If no user is found, throws UnauthorizedException — users must be created in the CMS
     * before they can log in.
     *
     * If the user is found but the current provider is not yet in their providers list,
     * the provider is added to providers and providerIdentifiers ("add on login").
     */
    private async findUser(opts: {
        userId: string;
        email: string;
        name: string;
        providerId: string;
    }): Promise<UserDto> {
        const { userId, email, name, providerId } = opts;

        // 1. Primary lookup: providerIdentifiers $elemMatch
        let result = await this.db.executeFindQuery({
            selector: {
                type: DocType.User,
                providerIdentifiers: { $elemMatch: { providerId, userId } },
            },
            limit: 1,
        });

        // 2. Fallback: legacy oAuthProviderId + userId compound key
        if (!result.docs?.length) {
            result = await this.db.executeFindQuery({
                selector: {
                    type: DocType.User,
                    oAuthProviderId: providerId,
                    userId,
                },
                limit: 1,
            });
        }

        // 3. Fallback: find by email + provider pre-authorisation ("first login" for new-style users).
        //    The admin assigns providers to a user in the CMS (user.providers array) but cannot
        //    know the external userId in advance. On first login we locate the user by their
        //    verified JWT email and confirm the provider is in their allowed list, then auto-link.
        if (!result.docs?.length && email) {
            result = await this.db.executeFindQuery({
                selector: {
                    type: DocType.User,
                    email,
                    providers: { $elemMatch: { $eq: providerId } },
                },
                limit: 1,
            });
        }

        // 4. Fallback: bare userId field (oldest legacy format — user was created before oAuthProviderId
        //    was introduced). Auto-links the provider on success so subsequent logins use path 1.
        if (!result.docs?.length) {
            result = await this.db.executeFindQuery({
                selector: {
                    type: DocType.User,
                    userId,
                },
                limit: 1,
            });
        }

        if (!result.docs?.length) {
            throw new UnauthorizedException(
                "No user found for this provider identity. Please contact an administrator.",
            );
        }

        let user = result.docs[0] as UserDto;

        // Determine which fields need updating
        const needsEmailUpdate = email && user.email !== email;
        const needsNameUpdate  = name  && user.name  !== name;

        // Check if this provider is already recorded on the user
        const alreadyLinked =
            user.providerIdentifiers?.some((pi) => pi.providerId === providerId && pi.userId === userId) ?? false;

        if (needsEmailUpdate || needsNameUpdate || !alreadyLinked) {
            user = {
                ...user,
                ...(needsEmailUpdate ? { email } : {}),
                ...(needsNameUpdate  ? { name  } : {}),
                lastLogin: Date.now(),
            };

            if (!alreadyLinked) {
                user.providers = [...new Set([...(user.providers ?? []), providerId])];
                user.providerIdentifiers = [
                    ...(user.providerIdentifiers ?? []),
                    { providerId, userId },
                ];
            }

            await this.db.upsertDoc(user);
            return user;
        }

        // Touch lastLogin
        await this.db.upsertDoc({ ...user, lastLogin: Date.now() });
        return user;
    }

    // -------------------------------------------------------------------------
    // Permission engine
    // -------------------------------------------------------------------------

    /**
     * Iterates over every GroupAssignment and evaluates its conditions against the JWT payload.
     * All conditions within a single assignment must pass (AND semantics).
     *
     * Returns the deduplicated set of groupIds where all conditions passed.
     * Falls back to [GUEST_GROUP_ID] when nothing matches.
     */
    private evaluateGroupAssignments(payload: JwtPayload, assignments: GroupAssignment[]): string[] {
        const matched = new Set<string>();

        for (const assignment of assignments) {
            const allPass = assignment.conditions.every((cond) =>
                this.evaluateCondition(cond, payload),
            );
            if (allPass) {
                matched.add(assignment.groupId);
            }
        }

        return matched.size > 0 ? [...matched] : [GUEST_GROUP_ID];
    }

    /**
     * Evaluates a single GroupAssignmentCondition against the JWT payload.
     *
     * | type          | semantics                                               |
     * |---------------|---------------------------------------------------------|
     * | always        | always true                                             |
     * | authenticated | true when the payload has a non-empty "sub" claim       |
     * | claimEquals   | claim value (string) strictly equals condition value    |
     * | claimIn       | claim value is contained in the condition values array  |
     */
    private evaluateCondition(condition: GroupAssignmentCondition, payload: JwtPayload): boolean {
        switch (condition.type) {
            case "always":
                return true;

            case "authenticated":
                return typeof payload.sub === "string" && payload.sub.length > 0;

            case "claimEquals": {
                const val = this.resolveClaim(payload, condition.claimPath);
                return val === condition.value;
            }

            case "claimIn": {
                const val = this.resolveClaim(payload, condition.claimPath);
                if (Array.isArray(val)) {
                    // If the claim is itself an array, check for any overlap
                    return val.some((v) => condition.values.includes(String(v)));
                }
                return condition.values.includes(String(val));
            }
        }
    }

    /**
     * Resolves a claimPath against the JWT payload.
     *
     * claimPath can be:
     *   - A top-level JWT key:         "sub", "email", "https://example.com/roles"
     *   - A dot-notation nested path:  "https://example.com/metadata.role"
     *     (splits on the LAST dot so URL-style namespaces are preserved)
     *
     * Returns the raw value (string | string[] | unknown) or undefined when not found.
     */
    private resolveClaim(payload: JwtPayload, claimPath: string): unknown {
        // First try the full path as a direct key (handles URL-shaped namespaced claims)
        if (Object.prototype.hasOwnProperty.call(payload, claimPath)) {
            return payload[claimPath];
        }

        // Fall back to dot-notation traversal (split on last dot only to preserve URLs)
        const lastDot = claimPath.lastIndexOf(".");
        if (lastDot !== -1) {
            const parentKey = claimPath.slice(0, lastDot);
            const childKey  = claimPath.slice(lastDot + 1);
            const parent = payload[parentKey];
            if (parent && typeof parent === "object" && !Array.isArray(parent)) {
                return (parent as Record<string, unknown>)[childKey];
            }
        }

        return undefined;
    }
}
