import { Injectable, Optional, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { DbService } from "../db/db.service";
import { DeleteReason, DocType, Uuid } from "../enums";
import { AccessMap } from "../permissions/permissions.service";
import { AuthIdentityService, IdentityResult, JwtUserDetails } from "./authIdentity.service";
import { IdentityCacheConfig } from "../configuration";
import { BoundedTtlCache } from "./boundedTtlCache";

/**
 * Resolved identity per token, including the accessMap built for that user on the miss, so a
 * hit needs no rebuilding. Any group change therefore clears the whole cache.
 */
type CachedIdentity = {
    status: "authenticated";
    groups: Array<Uuid>;
    userId?: Uuid;
    email?: string;
    name?: string;
    jwtPayload?: JwtUserDetails["jwtPayload"];
    accessMap: AccessMap;
};

/** Object.freeze applied to nested objects and arrays too, not just the top level. */
function deepFreeze<T>(value: T): T {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(deepFreeze);
    }
    return value;
}

/**
 * Per-token cache in front of {@link AuthIdentityService.resolveOrDefault}, shared by the REST
 * `AuthGuard` and the socket handshake. Always on. See `identityCache.README.md`.
 */
@Injectable()
export class IdentityCacheService implements OnModuleInit {
    private readonly maxAgeMs: number;
    private readonly now: () => number;
    private readonly cache: BoundedTtlCache<CachedIdentity>;
    // Bumped by invalidate() so a miss that was already resolving can't re-cache a stale result.
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
        this.maxAgeMs = cfg?.ttlMs ?? 300000;
        this.cache = new BoundedTtlCache<CachedIdentity>({
            maxEntries: cfg?.maxEntries,
            sweepIntervalMs: this.maxAgeMs,
            now: this.now,
        });
    }

    onModuleInit() {
        // Cached accessMaps were built from the group graph, so any group change (ACL edit, group
        // created or deleted) makes them all potentially stale.
        this.db.on("groupUpdate", () => {
            this.invalidate();
        });

        // User edits are not handled here: on the feed they look like our own lastLogin write, so
        // ChangeRequestService calls invalidate() instead.
        this.db.on("update", (doc: any) => {
            if (!doc?.type) return;

            // Membership removals arrive here too, so revocations made outside the API apply.
            if (
                doc.type === DocType.DeleteCmd &&
                doc.deleteReason === DeleteReason.PermissionChange &&
                doc.docType === DocType.User
            ) {
                this.invalidate();
                return;
            }

            // Default/dynamic group derivation or token-verification rules changed.
            if (doc.type === DocType.AuthProvider || doc.type === DocType.AutoGroupMappings) {
                this.invalidate();
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
                this.invalidate();
            }
        });

        // Change feed down → we can't trust freshness; drop everything (same rule as the other
        // DTO-derived caches: AuthIdentityService, QueryService.languages, S3Service).
        this.db.on("disconnect", () => {
            this.invalidate();
        });

        // Resolves during the outage can cache membership that changed while the feed was down.
        this.db.on("reconnect", () => {
            this.invalidate();
        });
    }

    /**
     * Cache-fronted equivalent of {@link AuthIdentityService.resolveOrDefault}. Identical
     * signature/return so callers are transport-agnostic. Anonymous requests (no token or
     * providerId) pass straight through.
     */
    async resolveOrDefault(token?: string, providerId?: string): Promise<IdentityResult> {
        if (!token || !providerId) {
            return this.authIdentityService.resolveOrDefault(token, providerId);
        }

        // JSON-encoded so no providerId/token pair can produce another pair's key.
        const key = this.hashToken(JSON.stringify([providerId, token]));

        const hit = this.cache.get(key);
        if (hit) {
            return {
                status: hit.status,
                userDetails: {
                    groups: [...hit.groups],
                    userId: hit.userId,
                    email: hit.email,
                    name: hit.name,
                    jwtPayload: hit.jwtPayload,
                    accessMap: hit.accessMap,
                },
            };
        }

        // Miss: run the full resolve. Auth failures throw here and are NOT cached.
        const generation = this.generation;
        const result = await this.authIdentityService.resolveOrDefault(token, providerId);

        // Only cache authenticated identities, never past the token's own expiry, and never if
        // the cache was invalidated while resolving (the result may predate the change).
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
                        // Every hit with this token shares these, so they are frozen: a change
                        // throws instead of leaking into later requests. The accessMap is frozen
                        // in place because structuredClone would drop the properties it keeps.
                        jwtPayload: deepFreeze(structuredClone(result.userDetails.jwtPayload)),
                        accessMap: deepFreeze(result.userDetails.accessMap),
                    },
                    ttlMs,
                );
            }
        }

        return result;
    }

    /** Drop every cached identity, e.g. after a User or group change. */
    invalidate(): void {
        this.generation++;
        this.cache.clear();
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
