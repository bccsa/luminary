import { Injectable, Optional, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { DbService } from "../db/db.service";
import { DeleteReason, DocType, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { AuthIdentityService, IdentityResult } from "./authIdentity.service";
import { IdentityCacheConfig } from "../configuration";
import { BoundedTtlCache } from "./boundedTtlCache";

/**
 * What we cache per token: the resolved membership + identity, WITHOUT the accessMap.
 * The accessMap is re-derived live from {@link PermissionSystem} on every hit so ACL
 * (`groupUpdate`) changes are picked up for free without invalidating this cache.
 */
type CachedIdentity = {
    status: "authenticated";
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
};

/**
 * Transport-agnostic cache in front of {@link AuthIdentityService.resolveOrDefault}.
 *
 * The full resolve (RS256 verify + 3–4 Mango user lookups + a `lastLogin` write) runs
 * once per token per TTL window; subsequent requests with the same token re-derive only
 * the (cheap) accessMap projection. Both the REST `AuthGuard` and the socket handshake
 * call this; a future SSE handler would call the same method, so SSE reconnect churn
 * becomes cache hits instead of re-resolves.
 *
 * Ships OFF (`IDENTITY_CACHE_ENABLED`). When disabled it is a pure passthrough.
 */
@Injectable()
export class IdentityCacheService implements OnModuleInit {
    private readonly enabled: boolean;
    private readonly maxAgeMs: number;
    private readonly now: () => number;
    private readonly cache?: BoundedTtlCache<CachedIdentity>;

    constructor(
        private readonly authIdentityService: AuthIdentityService,
        private readonly configService: ConfigService,
        private readonly db: DbService,
        // Injectable clock (ms). Shared with the BoundedTtlCache so TTL computation and the

        @Optional() now: () => number = Date.now,
    ) {
        this.now = now;
        const cfg = this.configService.get<IdentityCacheConfig>("identityCache");
        this.enabled = !!cfg?.enabled;
        this.maxAgeMs = cfg?.ttlMs ?? 300000;
        if (this.enabled) {
            this.cache = new BoundedTtlCache<CachedIdentity>({
                maxEntries: cfg.maxEntries,
                now: this.now,
            });
        }
    }

    onModuleInit() {
        if (!this.enabled || !this.cache) return;

        // Membership changes (additions AND removals) arrive as a write-side `permissionChange`
        // event carrying the changed doc's type. We invalidate on User membership changes here
        // rather than off the feed because a pure memberOf ADDITION produces no DeleteCmd — on
        // the feed it is indistinguishable from a `lastLogin`-style plain User `update`, which we
        // must keep ignoring (otherwise each miss's own `lastLogin` write would evict the entry).
        this.db.on("permissionChange", (evt: any) => {
            if (evt?.docType === DocType.User) this.cache.clear();
        });

        // Invalidate on the rare events that change resolved membership or token-verification
        // rules. NOT `groupUpdate`: we don't cache the accessMap (it's re-derived live), so an
        // ACL edit needs no flush here. A plain User `update` (e.g. the `lastLogin` write) is
        // intentionally ignored — membership changes come through `permissionChange` (above) and
        // user deletion/provider/mapping changes are handled below, so `lastLogin` churn never
        // evicts the cache. Keeping this load-bearing lets the `lastLogin` write cadence stay a
        // free, decoupled choice.
        this.db.on("update", (doc: any) => {
            if (!doc?.type) return;

            // Membership revoked via the feed (DeleteCmd): redundant with `permissionChange` on a
            // single instance, but the feed-based path also covers removals on multi-instance.
            if (
                doc.type === DocType.DeleteCmd &&
                doc.deleteReason === DeleteReason.PermissionChange &&
                doc.docType === DocType.User
            ) {
                this.cache.clear();
                return;
            }

            // Default/dynamic group derivation or token-verification rules changed.
            if (doc.type === DocType.AuthProvider || doc.type === DocType.AutoGroupMappings) {
                this.cache.clear();
                return;
            }
            // A User/provider/mapping doc was deleted. User deletion flows through the `deleteReq`
            // path (no `permissionChange` emit), so this feed handler is the revocation hook for
            // it: a deleted user's still-valid JWT must stop resolving from cache with stale
            // (over-)access.
            if (
                doc.type === DocType.DeleteCmd &&
                doc.deleteReason === DeleteReason.Deleted &&
                (doc.docType === DocType.AuthProvider ||
                    doc.docType === DocType.AutoGroupMappings ||
                    doc.docType === DocType.User)
            ) {
                this.cache.clear();
            }
        });

        // Change feed down → we can't trust freshness; drop everything (same rule as the other
        // DTO-derived caches: AuthIdentityService, QueryService.languages, S3Service).
        this.db.on("disconnect", () => {
            this.cache.clear();
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
            // Re-derive the accessMap live so ACL-graph changes are always reflected.
            const accessMap = PermissionSystem.getAccessMap(hit.groups);
            return {
                status: hit.status,
                userDetails: {
                    groups: hit.groups,
                    userId: hit.userId,
                    email: hit.email,
                    name: hit.name,
                    accessMap,
                },
            };
        }

        // Miss: run the full resolve. Auth failures throw here and are NOT cached.
        const result = await this.authIdentityService.resolveOrDefault(token, providerId);

        // Only cache authenticated identities, and never past the token's own expiry.
        if (result.status === "authenticated") {
            const ttlMs = this.computeTtlMs(result.userDetails.jwtPayload?.exp);
            if (ttlMs > 0) {
                this.cache.set(
                    key,
                    {
                        status: "authenticated",
                        groups: result.userDetails.groups,
                        userId: result.userDetails.userId,
                        email: result.userDetails.email,
                        name: result.userDetails.name,
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

    /** SHA-256 of the token so raw JWTs are never held in memory as keys. */
    private hashToken(value: string): string {
        return createHash("sha256").update(value).digest("hex");
    }
}
