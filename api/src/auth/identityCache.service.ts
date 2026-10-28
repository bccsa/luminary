import { Injectable, Optional, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { DbService } from "../db/db.service";
import { DeleteReason, DocType, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { AuthIdentityService, IdentityResult, JwtUserDetails } from "./authIdentity.service";
import { IdentityCacheConfig } from "../configuration";
import { BoundedTtlCache } from "./boundedTtlCache";

/**
 * Resolved membership + identity per token. The accessMap is deliberately not cached: it is
 * re-derived from {@link PermissionSystem} on each hit, so ACL changes need no invalidation here.
 */
type CachedIdentity = {
    status: "authenticated";
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
    jwtPayload?: JwtUserDetails["jwtPayload"];
};

/**
 * Per-token cache in front of {@link AuthIdentityService.resolveOrDefault}, shared by the REST
 * `AuthGuard` and the socket handshake. Off unless `IDENTITY_CACHE_ENABLED=true`; when off it is
 * a pure passthrough. See `identityCache.README.md`.
 */
@Injectable()
export class IdentityCacheService implements OnModuleInit {
    private readonly enabled: boolean;
    private readonly maxAgeMs: number;
    private readonly now: () => number;
    private readonly cache?: BoundedTtlCache<CachedIdentity>;
    // Bumped on every flush so a miss that was already resolving can't re-cache a stale result.
    private generation = 0;

    constructor(
        private readonly authIdentityService: AuthIdentityService,
        private readonly configService: ConfigService,
        private readonly db: DbService,
        // Injectable clock (ms), shared with the cache so TTLs and token expiry use one clock.
        @Optional() now: () => number = Date.now,
    ) {
        this.now = now;
        const cfg = this.configService.get<IdentityCacheConfig>("identityCache");
        this.enabled = !!cfg?.enabled;
        this.maxAgeMs = cfg?.ttlMs ?? 300000;
        if (this.enabled) {
            this.cache = new BoundedTtlCache<CachedIdentity>({
                maxEntries: cfg.maxEntries,
                sweepIntervalMs: this.maxAgeMs,
                now: this.now,
            });
        }
    }

    onModuleInit() {
        if (!this.enabled || !this.cache) return;

        // Write-side signal for User changes (memberOf, new user, email/providerId) that the feed
        // can't tell apart from our own lastLogin write, which must not flush.
        this.db.on("permissionChange", (evt: any) => {
            if (evt?.docType === DocType.User) this.flush();
        });

        // Group (ACL) updates are deliberately not handled: the accessMap is re-derived per hit.
        this.db.on("update", (doc: any) => {
            if (!doc?.type) return;

            // Feed-side membership removal; also reaches instances that didn't do the write.
            if (
                doc.type === DocType.DeleteCmd &&
                doc.deleteReason === DeleteReason.PermissionChange &&
                doc.docType === DocType.User
            ) {
                this.flush();
                return;
            }

            // Default/dynamic group derivation or token-verification rules changed.
            if (doc.type === DocType.AuthProvider || doc.type === DocType.AutoGroupMappings) {
                this.flush();
                return;
            }
            // Deletions arrive only as feed DeleteCmds; a deleted user's still-valid JWT must stop
            // resolving from cache.
            if (
                doc.type === DocType.DeleteCmd &&
                doc.deleteReason === DeleteReason.Deleted &&
                (doc.docType === DocType.AuthProvider ||
                    doc.docType === DocType.AutoGroupMappings ||
                    doc.docType === DocType.User)
            ) {
                this.flush();
            }
        });

        // Change feed down → we can't trust freshness; drop everything (same rule as the other
        // DTO-derived caches: AuthIdentityService, QueryService.languages, S3Service).
        this.db.on("disconnect", () => {
            this.flush();
        });

        // Resolves during the outage can cache membership that changed while the feed was down.
        this.db.on("reconnect", () => {
            this.flush();
        });
    }

    /**
     * Cache-fronted equivalent of {@link AuthIdentityService.resolveOrDefault}. Identical
     * signature/return so callers are transport-agnostic. Anonymous (no token) and the
     * disabled state pass straight through.
     */
    async resolveOrDefault(token?: string, providerId?: string): Promise<IdentityResult> {
        if (!this.enabled || !this.cache || !token || !providerId) {
            return this.authIdentityService.resolveOrDefault(token, providerId);
        }

        const key = this.hashToken(`${providerId}:${token}`);

        const hit = this.cache.get(key);
        if (hit) {
            // Sourced from PermissionSystem so ACL-graph changes are always reflected.
            const accessMap = PermissionSystem.getAccessMap(hit.groups);
            return {
                status: hit.status,
                userDetails: {
                    groups: [...hit.groups],
                    userId: hit.userId,
                    email: hit.email,
                    name: hit.name,
                    jwtPayload: hit.jwtPayload,
                    accessMap,
                },
            };
        }

        // Miss: run the full resolve. Auth failures throw here and are NOT cached.
        const generation = this.generation;
        const result = await this.authIdentityService.resolveOrDefault(token, providerId);

        // Only cache authenticated identities, never past the token's own expiry, and never if
        // a flush happened while resolving (the result may predate the change that caused it).
        if (result.status === "authenticated" && generation === this.generation) {
            const ttlMs = this.computeTtlMs(result.userDetails.jwtPayload?.exp);
            if (ttlMs > 0) {
                this.cache.set(
                    key,
                    {
                        status: "authenticated",
                        groups: [...result.userDetails.groups],
                        userId: result.userDetails.userId,
                        email: result.userDetails.email,
                        name: result.userDetails.name,
                        jwtPayload: result.userDetails.jwtPayload,
                    },
                    ttlMs,
                );
            }
        }

        return result;
    }

    /**
     * TTL never exceeds the token's `exp` (a hit must never serve an expired token); it is
     * further capped by the configured max age. `exp` is in seconds (JWT). Falls back to the
     * max age when the token carries no `exp`.
     */
    private computeTtlMs(expSeconds?: number): number {
        if (typeof expSeconds !== "number") return this.maxAgeMs;
        const untilExpiry = expSeconds * 1000 - this.now();
        return Math.min(untilExpiry, this.maxAgeMs);
    }

    private flush(): void {
        this.generation++;
        this.cache.clear();
    }

    /** SHA-256 of the token so raw JWTs are never held in memory as keys. */
    private hashToken(value: string): string {
        return createHash("sha256").update(value).digest("hex");
    }
}
