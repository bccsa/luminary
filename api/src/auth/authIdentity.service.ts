import { Injectable, Logger, OnModuleInit, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as JWT from "jsonwebtoken";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import jwksRsa = require("jwks-rsa");
import { AuthProviderDto } from "../dto/AuthProviderDto";
import {
    AuthProviderCondition,
    AuthProviderConfigDto,
    AuthProviderGroupMapping,
    AuthProviderProviderConfig,
} from "../dto/AuthProviderConfigDto";
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
    // undefined = not loaded; null = loaded but missing from DB; object = loaded
    private singletonConfigCache: AuthProviderConfigDto | null | undefined = undefined;
    private defaultGroupsCache: string[] | null = null;

    constructor(
        private jwtService: JwtService,
        private dbService: DbService,
    ) {}

    onModuleInit() {
        this.dbService.on("update", (doc: any) => {
            if (doc.type === DocType.AuthProvider) {
                this.providerCache.set(doc._id, doc as AuthProviderDto);
                // Clear associated JWKS client so it's rebuilt with new domain settings
                this.jwksClients.delete(doc.domain);
            } else if (doc.type === DocType.AuthProviderConfig) {
                this.singletonConfigCache = doc as AuthProviderConfigDto;
            } else if (doc.type === DocType.DefaultPermissions) {
                this.defaultGroupsCache = doc.defaultGroups ?? [];
            }
        });
    }

    /**
     * Returns the AuthProviderConfig singleton document — the server-side JWT
     * processing settings for every auth provider, keyed by
     * `AuthProviderDto.configId`. Cached in memory and kept fresh via the DB
     * change feed.
     */
    async getAuthProviderConfig(): Promise<AuthProviderConfigDto | null> {
        if (this.singletonConfigCache !== undefined) {
            return this.singletonConfigCache;
        }

        const configRes = await this.dbService.executeFindQuery({
            selector: { type: DocType.AuthProviderConfig },
            limit: 1,
        });

        const doc = (configRes.docs?.[0] as AuthProviderConfigDto) ?? null;
        this.singletonConfigCache = doc;
        return doc;
    }

    /**
     * Phase 1: Returns the defaultGroups from the DefaultPermissions document.
     * These groups are automatically assigned to every user, including guests.
     * Result is cached and kept fresh via the DB change feed.
     */
    async getDefaultGroups(): Promise<string[]> {
        if (this.defaultGroupsCache !== null) {
            return this.defaultGroupsCache;
        }

        const configRes = await this.dbService.executeFindQuery({
            selector: { type: DocType.DefaultPermissions },
            limit: 1,
        });

        this.defaultGroupsCache = configRes.docs?.[0]?.defaultGroups ?? [];
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
                throw new UnauthorizedException(
                    error instanceof Error ? error.message : "Invalid authentication token",
                );
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
        mappings: AuthProviderGroupMapping[],
    ): string[] {
        if (!jwtPayload || !mappings || !Array.isArray(mappings)) {
            return [];
        }

        const assignedGroups = new Set<string>();

        for (const mapping of mappings) {
            // TODO(post-migration): drop the legacy `groupId` fallback once every
            // deployment has saved its AuthProviderConfig singleton at least once
            // post-release — processAuthProviderConfigDto normalizes legacy docs
            // on write, so this branch only covers read-before-first-save.
            const legacyGroupId = (mapping as unknown as { groupId?: string }).groupId;
            const groupIds =
                mapping.groupIds ?? (legacyGroupId ? [legacyGroupId] : []);
            if (groupIds.length === 0 || !Array.isArray(mapping.conditions)) {
                continue;
            }

            // A group is assigned if AT LEAST ONE condition evaluates to true (OR logic)
            const isAssigned = mapping.conditions.some((condition) =>
                this.evaluateCondition(jwtPayload, condition),
            );

            if (isAssigned) {
                for (const id of groupIds) assignedGroups.add(id);
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
     * Phase 1 – Global defaults: Fetches defaultGroups from DefaultPermissions.
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

            const configDoc = await this.getAuthProviderConfig();
            const providerConfig: AuthProviderProviderConfig | undefined = provider.configId
                ? configDoc?.providers?.[provider.configId]
                : undefined;

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

            const dynamicGroups = this.evaluateGroupAssignments(
                payload,
                providerConfig?.groupMappings ?? [],
            );

            // ── Phase 3: Master user account linking ────────────────────────────────
            // Use configured claim paths, falling back to standard OIDC claim names
            const externalUserId: string | undefined =
                this.extractClaimValue(
                    payload,
                    providerConfig?.userFieldMappings?.externalUserId || "sub",
                ) ?? this.extractClaimValue(payload, "sub");
            const email: string | undefined =
                this.extractClaimValue(
                    payload,
                    providerConfig?.userFieldMappings?.email || "email",
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
// TODO
// Transparency on Logo instead of opacity
