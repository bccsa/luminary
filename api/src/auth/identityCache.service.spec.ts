import { EventEmitter } from "events";
import { ConfigService } from "@nestjs/config";
import { IdentityCacheService } from "./identityCache.service";
import { AuthIdentityService, IdentityResult } from "./authIdentity.service";
import { PermissionSystem } from "../permissions/permissions.service";
import { DbService } from "../db/db.service";
import { DeleteReason, DocType } from "../enums";

const CONFIG_KEY = "identityCache";

function authResult(over: Partial<IdentityResult["userDetails"]> = {}): IdentityResult {
    return {
        status: "authenticated",
        userDetails: {
            groups: ["g1", "g2"],
            userId: "user-1",
            email: "a@b.com",
            name: "A",
            // far-future expiry (seconds) so the entry is cacheable
            jwtPayload: { exp: Math.floor(Date.now() / 1000) + 3600 },
            accessMap: new Map() as any,
            ...over,
        },
    };
}

function makeService(cfg: any, now?: () => number) {
    const authIdentity = {
        resolveOrDefault: jest.fn().mockResolvedValue(authResult()),
    } as unknown as AuthIdentityService & { resolveOrDefault: jest.Mock };

    const configService = {
        get: (key: string) => (key === CONFIG_KEY ? cfg : undefined),
    } as unknown as ConfigService;

    // A real EventEmitter so we can drive invalidation via emit().
    const db = new EventEmitter() as unknown as DbService;

    const svc = new IdentityCacheService(authIdentity, configService, db, now);
    svc.onModuleInit();
    return { svc, authIdentity, db: db as unknown as EventEmitter };
}

const enabledCfg = { enabled: true, ttlMs: 300000, maxEntries: 1000 };

describe("IdentityCacheService", () => {
    let getAccessMapSpy: jest.SpyInstance;

    beforeEach(() => {
        getAccessMapSpy = jest
            .spyOn(PermissionSystem, "getAccessMap")
            .mockReturnValue(new Map() as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("passthrough", () => {
        it("does not cache when disabled (calls resolveOrDefault every time)", async () => {
            const { svc, authIdentity } = makeService({ enabled: false });
            await svc.resolveOrDefault("t", "p");
            await svc.resolveOrDefault("t", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });

        it("passes through the anonymous path (no token) without caching", async () => {
            const { svc, authIdentity } = makeService(enabledCfg);
            await svc.resolveOrDefault(undefined, undefined);
            await svc.resolveOrDefault(undefined, undefined);
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledWith(undefined, undefined);
        });

        it("passes through when a token is given without a providerId", async () => {
            const { svc, authIdentity } = makeService(enabledCfg);
            await svc.resolveOrDefault("t", undefined);
            await svc.resolveOrDefault("t", undefined);
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });
    });

    describe("hit / miss", () => {
        it("caches on miss and serves the second request from cache", async () => {
            const { svc, authIdentity } = makeService(enabledCfg);
            await svc.resolveOrDefault("t", "p");
            await svc.resolveOrDefault("t", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(1);
        });

        it("re-derives the accessMap live on a hit from the cached groups", async () => {
            const { svc } = makeService(enabledCfg);
            await svc.resolveOrDefault("t", "p"); // miss → cache
            getAccessMapSpy.mockClear();

            const sentinel = new Map([["live", true]]) as any;
            getAccessMapSpy.mockReturnValue(sentinel);

            const res = await svc.resolveOrDefault("t", "p"); // hit
            expect(getAccessMapSpy).toHaveBeenCalledWith(["g1", "g2"]);
            expect(res.userDetails.accessMap).toBe(sentinel);
            expect(res.userDetails.groups).toEqual(["g1", "g2"]);
            expect(res.userDetails.userId).toBe("user-1");
        });

        it("keys distinct tokens independently", async () => {
            const { svc, authIdentity } = makeService(enabledCfg);
            await svc.resolveOrDefault("t1", "p");
            await svc.resolveOrDefault("t2", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });

        it("does not cache an already-expired token (ttl <= 0)", async () => {
            const { svc, authIdentity } = makeService(enabledCfg);
            authIdentity.resolveOrDefault.mockResolvedValue(
                authResult({ jwtPayload: { exp: Math.floor(Date.now() / 1000) - 10 } }),
            );
            await svc.resolveOrDefault("t", "p");
            await svc.resolveOrDefault("t", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });

        it("does not cache thrown auth failures and propagates them", async () => {
            const { svc, authIdentity } = makeService(enabledCfg);
            authIdentity.resolveOrDefault.mockRejectedValue(new Error("boom"));
            await expect(svc.resolveOrDefault("t", "p")).rejects.toThrow("boom");
            await expect(svc.resolveOrDefault("t", "p")).rejects.toThrow("boom");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });
    });

    describe("invalidation", () => {
        const seed = async (svc: IdentityCacheService) => {
            await svc.resolveOrDefault("t", "p"); // miss → cache
        };
        const isHit = async (
            svc: IdentityCacheService,
            authIdentity: { resolveOrDefault: jest.Mock },
        ) => {
            authIdentity.resolveOrDefault.mockClear();
            await svc.resolveOrDefault("t", "p");
            return authIdentity.resolveOrDefault.mock.calls.length === 0;
        };

        it("clears on a User permissionChange event (membership add or remove)", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("permissionChange", { docType: DocType.User, docId: "user-1" });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("does NOT clear on a non-User permissionChange event", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("permissionChange", { docType: DocType.Post, docId: "post-1" });
            expect(await isHit(svc, authIdentity)).toBe(true);
        });

        it("clears on a User PermissionChange DeleteCmd (feed-based removal)", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("update", {
                type: DocType.DeleteCmd,
                deleteReason: DeleteReason.PermissionChange,
                docType: DocType.User,
                docId: "user-1",
            });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on a User Deleted DeleteCmd (account deletion revocation)", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("update", {
                type: DocType.DeleteCmd,
                deleteReason: DeleteReason.Deleted,
                docType: DocType.User,
                docId: "user-1",
            });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on an AuthProvider update", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("update", { type: DocType.AuthProvider, _id: "ap1" });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on an AutoGroupMappings update", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("update", { type: DocType.AutoGroupMappings, _id: "m1" });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on disconnect", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("disconnect");
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("does NOT clear on a plain User update (e.g. lastLogin write)", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            db.emit("update", { type: DocType.User, _id: "user-1", lastLogin: 123 });
            expect(await isHit(svc, authIdentity)).toBe(true);
        });

        it("does NOT clear on a groupUpdate-style Group update (accessMap is re-derived live)", async () => {
            const { svc, authIdentity, db } = makeService(enabledCfg);
            await seed(svc);
            // Group docs come through `update` too; the service must ignore them for Layer I.
            db.emit("update", { type: DocType.Group, _id: "g1" });
            expect(await isHit(svc, authIdentity)).toBe(true);
        });
    });

    describe("clock (injected, shared with the cache)", () => {
        const BASE = 1_700_000_000_000; // fixed ms base so exp is relative to the fake clock

        it("expires a hit once the injected clock passes the TTL (capped by maxAge)", async () => {
            let clock = BASE;
            const { svc, authIdentity } = makeService(enabledCfg, () => clock);
            // Far-future exp → TTL is capped by maxAge (300000), not by expiry.
            authIdentity.resolveOrDefault.mockResolvedValue(
                authResult({ jwtPayload: { exp: Math.floor(BASE / 1000) + 3600 } }),
            );

            await svc.resolveOrDefault("t", "p"); // miss → cache, expiresAt = BASE + 300000
            authIdentity.resolveOrDefault.mockClear();

            clock = BASE + 299_999;
            await svc.resolveOrDefault("t", "p"); // still live → hit
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(0);

            clock = BASE + 300_001;
            await svc.resolveOrDefault("t", "p"); // expired → re-resolve
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(1);
        });

        it("caps the TTL at the token's own exp when that is sooner than maxAge", async () => {
            let clock = BASE;
            const { svc, authIdentity } = makeService(enabledCfg, () => clock);
            // exp is 10s out → TTL = min(10000, 300000) = 10000.
            authIdentity.resolveOrDefault.mockResolvedValue(
                authResult({ jwtPayload: { exp: Math.floor(BASE / 1000) + 10 } }),
            );

            await svc.resolveOrDefault("t", "p"); // miss → cache, expiresAt = BASE + 10000
            authIdentity.resolveOrDefault.mockClear();

            clock = BASE + 9_000;
            await svc.resolveOrDefault("t", "p"); // still live → hit
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(0);

            clock = BASE + 10_001;
            await svc.resolveOrDefault("t", "p"); // past exp → re-resolve
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(1);
        });
    });
});
