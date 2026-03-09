import { Injectable } from "@nestjs/common";
import { JwtPayload } from "jsonwebtoken";
import { randomUUID } from "crypto";
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
    /** Group IDs that passed all conditions in groupAssignments. Falls back to the guest group. */
    groupIds: string[];
};

/** Fallback group assigned when no groupAssignment conditions match. */
const GUEST_GROUP_ID = "group-public-users";

@Injectable()
export class AuthIdentityService {
    constructor(private readonly db: DbService) {}

    /**
     * Main entry point.  Given a verified JWT payload and the matching OAuthProvider document,
     * resolves the user identity (find-or-provision) and evaluates all groupAssignment rules.
     */
    async resolveIdentity(payload: JwtPayload, provider: OAuthProviderDto): Promise<ResolvedIdentity> {
        const { userId, email, name } = this.extractUserFields(payload, provider);
        const user = await this.findOrProvisionUser({ userId, email, name, providerId: provider._id });
        const groupIds = this.evaluateGroupAssignments(payload, provider.groupAssignments ?? []);

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
     * Looks up an existing user by (oAuthProviderId, userId) or creates a new one.
     * The combination of provider ID + external user ID is globally unique.
     */
    private async findOrProvisionUser(opts: {
        userId: string;
        email: string;
        name: string;
        providerId: string;
    }): Promise<UserDto> {
        const { userId, email, name, providerId } = opts;

        // Query by the compound key (oAuthProviderId + userId)
        const result = await this.db.executeFindQuery({
            selector: {
                type: DocType.User,
                oAuthProviderId: providerId,
                userId,
            },
            limit: 1,
        });

        if (result.docs?.length > 0) {
            const existing = result.docs[0] as UserDto;

            // Refresh mutable fields that may have changed in the identity provider
            const needsUpdate =
                (email && existing.email !== email) ||
                (name  && existing.name  !== name);

            if (needsUpdate) {
                const updated: UserDto = {
                    ...existing,
                    ...(email ? { email } : {}),
                    ...(name  ? { name  } : {}),
                    lastLogin: Date.now(),
                };
                await this.db.upsertDoc(updated);
                return updated;
            }

            // Touch lastLogin without triggering a full update cycle
            await this.db.upsertDoc({ ...existing, lastLogin: Date.now() });
            return existing;
        }

        // Provision a new user document
        const newUser: UserDto = {
            _id: randomUUID(),
            type: DocType.User,
            memberOf: [],
            oAuthProviderId: providerId,
            userId,
            email: email || `${userId}@unknown`,
            name:  name  || userId,
            lastLogin: Date.now(),
        };

        await this.db.upsertDoc(newUser);
        return newUser;
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
