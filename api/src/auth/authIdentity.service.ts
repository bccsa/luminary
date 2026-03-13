import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as JWT from "jsonwebtoken";
import * as jwksRsa from "jwks-rsa";
import { AuthProviderCondition, AuthProviderDto, AuthProviderGroupMapping } from "../dto/AuthProviderDto";
import { DbService } from "../db/db.service";
import { UserDto } from "../dto/UserDto";
import { DocType } from "../enums";
import { JwtUserDetails } from "../jwt/processJwt";
import { PermissionSystem } from "../permissions/permissions.service";

@Injectable()
export class AuthIdentityService {
    private readonly logger = new Logger(AuthIdentityService.name);
    private jwksClients: Map<string, jwksRsa.JwksClient> = new Map();
    private providerCache: Map<string, { data: AuthProviderDto; expiresAt: number }> = new Map();
    private defaultGroupsCache: { data: string[]; expiresAt: number } | null = null;

    constructor(
        private jwtService: JwtService,
        private dbService: DbService,
    ) {}

    /**
     * Phase 1: Returns the defaultGroups from the GlobalConfig document.
     * These groups are automatically assigned to every user, including guests.
     * Result is cached for 5 minutes.
     */
    async getDefaultGroups(): Promise<string[]> {
        if (this.defaultGroupsCache && this.defaultGroupsCache.expiresAt > Date.now()) {
            return this.defaultGroupsCache.data;
        }

        const configRes = await this.dbService.executeFindQuery({
            selector: { type: DocType.GlobalConfig },
            limit: 1,
        });

        const defaultGroups: string[] = configRes.docs?.[0]?.defaultGroups ?? [];
        this.defaultGroupsCache = { data: defaultGroups, expiresAt: Date.now() + 5 * 60 * 1000 };
        return defaultGroups;
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
            if (!mapping.groupId || !Array.isArray(mapping.conditions)) {
                continue;
            }

            // A group is assigned if AT LEAST ONE condition evaluates to true (OR logic)
            const isAssigned = mapping.conditions.some((condition) =>
                this.evaluateCondition(jwtPayload, condition),
            );

            if (isAssigned) {
                assignedGroups.add(mapping.groupId);
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
                const claimValue = this.extractClaimValue(jwtPayload, condition.claimPath);
                return claimValue === condition.value;
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
     * Checks for an exact match first to support namespaced claims (e.g., 'https://domain.com/roles'),
     * then falls back to dot-notation parsing.
     */
    public extractClaimValue(payload: any, path: string): any {
        if (!payload || typeof payload !== "object" || !path) return undefined;

        // 1. Exact match first
        if (payload[path] !== undefined) {
            return payload[path];
        }

        // 2. Fallback to dot notation parsing
        const keys = path.split(".");
        let current = payload;

        for (const key of keys) {
            if (current === undefined || current === null || typeof current !== "object") {
                return undefined;
            }
            current = current[key];
        }

        return current;
    }

    /**
     * Resolves a user identity using the 3-phase federated identity pipeline.
     *
     * Phase 1 – Global defaults: Fetches defaultGroups from GlobalConfig.
     * Phase 2 – Provider context: Verifies the JWT via JWKS and evaluates groupMappings.
     * Phase 3 – Identity linking: Looks up or provisions the master User document,
     *            linking the external identity into the identities[] array.
     */
    async resolveIdentity(token: string, providerId: string): Promise<JwtUserDetails> {
        try {
            // ── Phase 1: Global default groups ──────────────────────────────────────
            const defaultGroups = await this.getDefaultGroups();

            // ── Phase 2: Provider-specific context ──────────────────────────────────
            let provider: AuthProviderDto;
            const cachedProvider = this.providerCache.get(providerId);

            if (cachedProvider && cachedProvider.expiresAt > Date.now()) {
                provider = cachedProvider.data;
            } else {
                const providerRes = await this.dbService.getDoc(providerId);
                if (!providerRes.docs || providerRes.docs.length === 0) {
                    this.logger.warn(`Auth provider not found: ${providerId}`);
                    throw new UnauthorizedException("Provider not found");
                }
                provider = providerRes.docs[0] as AuthProviderDto;
                this.providerCache.set(providerId, {
                    data: provider,
                    expiresAt: Date.now() + 5 * 60 * 1000,
                });
            }

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

            const decodedToken = this.jwtService.decode(token, { complete: true }) as { header?: { kid?: string } } | null;
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

            const dynamicGroups = this.evaluateGroupAssignments(payload, provider.groupMappings ?? []);

            // ── Phase 3: Master user account linking ────────────────────────────────
            // Use configured claim paths, falling back to standard OIDC claim names
            const externalUserId: string | undefined = this.extractClaimValue(
                payload,
                provider.userFieldMappings?.externalUserId ?? "sub",
            );
            const email: string | undefined = this.extractClaimValue(
                payload,
                provider.userFieldMappings?.email ?? "email",
            );

            // Action 1: Fast path – lookup by externalUserId within identities[]
            let primaryUser: UserDto | null = null;
            let allUsers: UserDto[] = [];
            let identityLinked = false;

            if (externalUserId) {
                const byIdentity = await this.dbService.executeFindQuery({
                    selector: {
                        type: DocType.User,
                        identities: { $elemMatch: { externalUserId } },
                    },
                    limit: 1,
                });
                primaryUser = (byIdentity.docs?.[0] as UserDto) ?? null;
            }

            if (primaryUser) {
                // Fast path hit – fetch all sibling docs by email AND userId for group merging
                // Using both keys ensures we find sibling docs even if email casing differs between sources
                const siblings = await this.dbService.getUserByIdOrEmail(primaryUser.email, primaryUser.userId);
                allUsers = siblings.docs as UserDto[];
            } else {
                // Fallback – replicates main: finds ALL users by email OR legacy userId field
                const resolvedEmail = email ?? "";
                if (resolvedEmail || externalUserId) {
                    const byEmailOrUserId = await this.dbService.getUserByIdOrEmail(
                        resolvedEmail,
                        externalUserId,
                    );
                    allUsers = byEmailOrUserId.docs as UserDto[];
                }

                if (allUsers.length > 0) {
                    primaryUser = allUsers[0];

                    // Link identity to primary user if not already present
                    const alreadyLinked = primaryUser.identities?.some(
                        (i) => i.externalUserId === externalUserId && i.providerId === providerId,
                    );
                    if (!alreadyLinked) {
                        const updatedIdentities = [
                            ...(primaryUser.identities ?? []),
                            { providerId, externalUserId },
                        ];
                        primaryUser = { ...primaryUser, identities: updatedIdentities, lastLogin: Date.now() };
                        await this.dbService.upsertDoc(primaryUser);
                        identityLinked = true;
                    }
                }
            }

            if (!primaryUser) {
                this.logger.warn("No user found for the provided token");
                throw new UnauthorizedException("No user found");
            }

            // Update lastLogin for existing users (skip if already updated during identity linking)
            if (primaryUser._rev && !identityLinked) {
                await this.dbService.upsertDoc({ ...primaryUser, lastLogin: Date.now() });
            }

            // ── Final merge ─────────────────────────────────────────────────────────
            // Merge memberOf from ALL sibling users (same email) to preserve multi-admin group assignments
            const staticGroups = Array.from(new Set(allUsers.flatMap((u) => u.memberOf ?? [])));
            const mergedGroups = Array.from(new Set([...defaultGroups, ...dynamicGroups, ...staticGroups]));
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
            if (error instanceof Error) {
                if (error.name === "TokenExpiredError") {
                    this.logger.warn(`JWT expired: ${error.message}`);
                } else if (error.name === "JsonWebTokenError") {
                    this.logger.warn(`JWT verification failed: ${error.message}`);
                } else if (error.name === "JwksError" || error.message.toLowerCase().includes("jwks")) {
                    this.logger.error(`JWKS public key retrieval failed: ${error.message}`);
                } else {
                    this.logger.error("Authentication failed", error.message);
                }
            } else {
                this.logger.error("Authentication failed with unknown error", String(error));
            }
            throw new UnauthorizedException("Authentication failed");
        }
    }
}
