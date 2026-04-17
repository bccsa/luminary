import { Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as JWT from "jsonwebtoken";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jwksRsa = require("jwks-rsa");
import { AuthProviderDto } from "../dto/AuthProviderDto";
import { AuthProviderCondition, AutoGroupMappingsDto } from "../dto/AutoGroupMappingsDto";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
import { DocType, Uuid } from "../enums";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";

export type JwtUserDetails = {
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
    jwtPayload?: JWT.JwtPayload;
    accessMap?: AccessMap;
};

export type IdentityResult =
    | { status: "authenticated"; userDetails: JwtUserDetails }
    | { status: "anonymous"; userDetails: JwtUserDetails };

@Injectable()
export class AuthIdentityService implements OnModuleInit {
    private readonly logger = new Logger(AuthIdentityService.name);
    private jwksClients: Map<string, jwksRsa.JwksClient> = new Map();
    private providerCache: Map<string, AuthProviderDto> = new Map();
    private autoGroupMappingsCache: Map<string, AutoGroupMappingsDto[]> = new Map();
    private defaultGroupsCache: string[] | null = null;

    constructor(
        private jwtService: JwtService,
        private dbService: DbService,
    ) {}

    onModuleInit() {
        this.dbService.on("update", (doc: any) => {
            if (doc.type === DocType.AuthProvider) {
                this.providerCache.set(doc._id, doc as AuthProviderDto);
                this.jwksClients.delete(doc.domain);
            } else if (doc.type === DocType.AutoGroupMappings) {
                const mapping = doc as AutoGroupMappingsDto;
                if (mapping.providerId) {
                    this.autoGroupMappingsCache.delete(mapping.providerId);
                } else {
                    // Provider-less mappings act as default groups — invalidate that cache
                    this.defaultGroupsCache = null;
                }
            } else if (doc.type === DocType.DeleteCmd) {
                const deletedProvider = this.providerCache.get(doc.docId);
                if (deletedProvider) {
                    this.jwksClients.delete(deletedProvider.domain);
                    this.providerCache.delete(doc.docId);
                }
                this.autoGroupMappingsCache.delete(doc.docId);
                // A deleted mapping might have been a default — invalidate to be safe
                this.defaultGroupsCache = null;
            }
        });
    }

    async getAutoGroupMappings(providerId: string): Promise<AutoGroupMappingsDto[]> {
        const cached = this.autoGroupMappingsCache.get(providerId);
        if (cached) return cached;

        const res = await this.dbService.executeFindQuery({
            selector: { type: DocType.AutoGroupMappings, providerId },
        });

        const docs = (res.docs as AutoGroupMappingsDto[]) ?? [];
        this.autoGroupMappingsCache.set(providerId, docs);
        return docs;
    }

    /**
     * Phase 1: Returns the default groups derived from AutoGroupMappings that
     * have no providerId. These are automatically assigned to every user,
     * including unauthenticated guests.
     * Result is cached and kept fresh via the DB change feed.
     */
    async getDefaultGroups(): Promise<string[]> {
        if (this.defaultGroupsCache !== null) {
            return this.defaultGroupsCache;
        }

        // Provider-less mappings act as global defaults
        const res = await this.dbService.executeFindQuery({
            selector: {
                type: DocType.AutoGroupMappings,
                $or: [{ providerId: { $exists: false } }, { providerId: "" }],
            },
        });

        const docs = (res.docs as AutoGroupMappingsDto[]) ?? [];
        const groups = new Set<string>();
        for (const doc of docs) {
            for (const gid of doc.groupIds ?? []) groups.add(gid);
        }
        this.defaultGroupsCache = Array.from(groups);
        return this.defaultGroupsCache;
    }

    /**
     * Resolves a user identity if credentials are provided, otherwise returns
     * default groups. Returns a discriminated union so callers can react to
     * the outcome (e.g., logging or emitting events on auth failure).
     */
    async resolveOrDefault(token?: string, providerId?: string): Promise<IdentityResult> {
        if (token && providerId) {
            try {
                const userDetails = await this.resolveIdentity(token, providerId);
                return { status: "authenticated", userDetails };
            } catch (error) {
                // Log the real reason for debugging but never expose it to the client —
                // detailed error messages (e.g. "jwt audience invalid. expected: ...") act
                // as an error oracle that helps attackers probe the system.
                this.logger.warn("Token validation failed", {
                    reason: error instanceof Error ? error.message : error,
                    providerId,
                });
                throw new UnauthorizedException("Invalid authentication token");
            }
        }
        const defaultGroups = await this.getDefaultGroups();
        return {
            status: "anonymous",
            userDetails: {
                groups: defaultGroups,
                accessMap: PermissionSystem.getAccessMap(defaultGroups),
            },
        };
    }

    /**
     * Evaluates JWT payload against configured group mappings to determine
     * which dynamic groups the user should be assigned to.
     */
    public evaluateGroupAssignments(
        jwtPayload: any,
        mappings: AutoGroupMappingsDto[],
    ): string[] {
        if (!jwtPayload || !mappings || !Array.isArray(mappings)) {
            return [];
        }

        const assignedGroups = new Set<string>();

        for (const mapping of mappings) {
            if (!mapping.groupIds?.length || !Array.isArray(mapping.conditions)) {
                continue;
            }

            const isAssigned = mapping.conditions.every((condition) =>
                this.evaluateCondition(jwtPayload, condition),
            );

            if (isAssigned) {
                for (const id of mapping.groupIds) assignedGroups.add(id);
            }
        }

        return Array.from(assignedGroups);
    }

    private evaluateCondition(jwtPayload: any, condition: AuthProviderCondition): boolean {
        switch (condition.type) {
            case "authenticated":
                return true;

            case "claimEquals": {
                if (!condition.claimPath || condition.value === undefined) return false;
                if (typeof condition.value !== "string") return false;
                const claimValue = this.extractClaimValue(jwtPayload, condition.claimPath);
                return claimValue === this.parseValue(condition.value);
            }

            case "claimIn": {
                if (!condition.claimPath || !Array.isArray(condition.values)) return false;
                const claimValue = this.extractClaimValue(jwtPayload, condition.claimPath);

                // If the claim itself is an array of strings (e.g. roles: ["admin", "editor"])
                if (Array.isArray(claimValue)) {
                    // Return true if any value from the claim exists in the condition's allowed values
                    return claimValue.some((val) => condition.values.includes(val));
                }

                // If claim is a single string, check if it's in the condition's allowed values array
                return typeof claimValue === "string" && condition.values.includes(claimValue);
            }

            default:
                return false;
        }
    }

    /**
     * Extracts a claim value from a JWT payload based on a given path.
     * Uses a greedy strategy to handle keys that contain dots (e.g., namespaced claims):
     *   1. Exact match on the full path
     *   2. Greedy dot-split: tries the longest possible prefix as a key first,
     *      e.g. for "https://domain.com/metadata.email" it tries
     *      "https://domain.com/metadata" as a key then ".email" as a sub-property
     */
    public extractClaimValue(payload: any, path: string): any {
        if (!payload || typeof payload !== "object" || !path) return undefined;

        // 1. Exact match on the full path
        if (payload[path] !== undefined) {
            return payload[path];
        }

        // 2. Greedy dot-split: try longest prefix as key first, then recurse into remainder
        const dotPositions: number[] = [];
        for (let i = path.length - 1; i >= 0; i--) {
            if (path[i] === ".") dotPositions.push(i);
        }

        for (const pos of dotPositions) {
            const prefix = path.substring(0, pos);
            const remainder = path.substring(pos + 1);
            if (payload[prefix] !== undefined) {
                return this.extractClaimValue(payload[prefix], remainder);
            }
        }

        return undefined;
    }

    /**
     * Parses a string value into its corresponding primitive type.
     * Handles booleans ("true"/"false") and numbers, leaving other strings as-is.
     */
    private parseValue(value: string): string | boolean | number {
        if (value === "true") return true;
        if (value === "false") return false;
        const num = Number(value);
        if (value !== "" && !isNaN(num)) return num;
        return value;
    }

    /**
     * Resolves a user identity using the 3-phase federated identity pipeline.
     *
     * Phase 1 – Global defaults: Fetches default groups from provider-less AutoGroupMappings.
     * Phase 2 – Provider context: Verifies the JWT via JWKS and evaluates groupMappings.
     * Phase 3 – Identity linking: Looks up the master User document by externalUserId,
     *            falling back to email. Sets externalUserId on the user on first login.
     */
    async resolveIdentity(token: string, providerId: string): Promise<JwtUserDetails> {
        try {
            // ── Phase 1: Global default groups ──────────────────────────────────────
            const defaultGroups = await this.getDefaultGroups();

            // ── Phase 2: Provider-specific context ──────────────────────────────────
            let provider: AuthProviderDto;
            const cachedProvider = this.providerCache.get(providerId);

            if (cachedProvider) {
                provider = cachedProvider;
            } else {
                const providerRes = await this.dbService.getDoc(providerId);
                if (!providerRes.docs || providerRes.docs.length === 0) {
                    throw new UnauthorizedException("Provider not found");
                }
                provider = providerRes.docs[0] as AuthProviderDto;
                this.providerCache.set(providerId, provider);
            }

            const providerMappings = await this.getAutoGroupMappings(provider._id);

            let jwksClient = this.jwksClients.get(provider.domain);
            if (!jwksClient) {
                jwksClient = jwksRsa({
                    cache: true,
                    rateLimit: true,
                    jwksRequestsPerMinute: 5,
                    jwksUri: `https://${provider.domain}/.well-known/jwks.json`,
                });
                this.jwksClients.set(provider.domain, jwksClient);
            }

            const decodedToken = this.jwtService.decode(token, { complete: true }) as {
                header?: { kid?: string };
            } | null;
            if (!decodedToken?.header?.kid) {
                this.logger.warn("Invalid token format or missing kid");
                throw new UnauthorizedException();
            }

            const key = await jwksClient.getSigningKey(decodedToken.header.kid);
            const publicKey = key.getPublicKey();

            const payload = await this.jwtService.verifyAsync(token, {
                secret: publicKey,
                audience: provider.audience,
                issuer: `https://${provider.domain}/`,
                algorithms: ["RS256"],
            });

            // Verify the token was issued for this provider's client application.
            // The `azp` (authorized party) claim identifies which OIDC client the
            // token was issued to. Without this check, a token issued for client A
            // could be used with provider B if they share the same domain/audience.
            const tokenClientId = payload.azp ?? payload.client_id;
            if (tokenClientId && tokenClientId !== provider.clientId) {
                throw new UnauthorizedException("Token client ID mismatch");
            }

            const dynamicGroups = this.evaluateGroupAssignments(payload, providerMappings);

            // ── Phase 3: Master user account linking ────────────────────────────────
            // Normalise to string — some OIDC providers emit numeric `sub` claims
            // and Mango selectors are type-strict, so a number/string mismatch
            // between token and stored user doc breaks the lookup.
            const externalUserId: string | undefined = this.extractClaimValue(
                payload,
                provider.userFieldMappings?.externalUserId || "sub",
            )?.toString();
            const email: string | undefined =
                this.extractClaimValue(
                    payload,
                    provider.userFieldMappings?.email || "email",
                ) ?? this.extractClaimValue(payload, "email");

            let primaryUser: UserDto | null = null;

            // Action 1: Lookup by userId (deprecated legacy field)
            if (externalUserId) {
                const byUserId = await this.dbService.executeFindQuery({
                    selector: { type: DocType.User, userId: externalUserId },
                    limit: 1,
                });
                primaryUser = (byUserId.docs?.[0] as UserDto) ?? null;
            }

            // Action 2: Lookup by externalUserId (auto-assigned on first login)
            if (!primaryUser && externalUserId) {
                const byExternalId = await this.dbService.executeFindQuery({
                    selector: { type: DocType.User, externalUserId },
                    limit: 1,
                });
                primaryUser = (byExternalId.docs?.[0] as UserDto) ?? null;
            }

            // Action 3: Email fallback
            if (!primaryUser && email) {
                const byEmail = await this.dbService.executeFindQuery({
                    selector: { type: DocType.User, email },
                    limit: 1,
                });
                primaryUser = (byEmail.docs?.[0] as UserDto) ?? null;
            }

            if (!primaryUser) {
                this.logger.log(
                    `No user doc for externalUserId: ${externalUserId ?? "(none)"}, email: ${
                        email ?? "(none)"
                    } — returning default + dynamic groups only`,
                );
                const mergedGroups = Array.from(new Set([...defaultGroups, ...dynamicGroups]));
                const accessMap = PermissionSystem.getAccessMap(mergedGroups);
                return {
                    groups: mergedGroups,
                    email,
                    jwtPayload: payload as JWT.JwtPayload,
                    accessMap,
                };
            }

            // Link identity: set externalUserId on the user if not already present.
            const needsIdentityLink = !primaryUser.externalUserId && externalUserId;
            if (needsIdentityLink) {
                primaryUser = { ...primaryUser, externalUserId };
            }

            // Merge groups from all user docs with the same email (handles multiple docs per user)
            let allMemberOf = primaryUser.memberOf ?? [];
            if (primaryUser.email) {
                const allByEmail = await this.dbService.executeFindQuery({
                    selector: { type: DocType.User, email: primaryUser.email },
                });
                const emailUserDocs = (allByEmail.docs as UserDto[]) ?? [];
                if (emailUserDocs.length > 1) {
                    allMemberOf = emailUserDocs.flatMap((d) => d.memberOf ?? []);
                }
            }

            // Persist identity link and lastLogin
            await this.dbService.upsertDoc({ ...primaryUser, lastLogin: Date.now() });

            const staticGroups = Array.from(new Set(allMemberOf));
            const mergedGroups = Array.from(
                new Set([...defaultGroups, ...dynamicGroups, ...staticGroups]),
            );
            const accessMap = PermissionSystem.getAccessMap(mergedGroups);

            return {
                groups: mergedGroups,
                userId: primaryUser._id,
                email: primaryUser.email,
                name: primaryUser.name,
                jwtPayload: payload as JWT.JwtPayload,
                accessMap,
            };
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            this.logger.error("Unexpected error resolving identity", error);
            throw new UnauthorizedException("Authentication failed");
        }
    }
}
