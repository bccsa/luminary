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

const cacheCfg = { ttlMs: 300000, maxEntries: 1000 };

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

    describe("setup and anonymous passthrough", () => {
        it("caches with the default settings when there is no identityCache config", async () => {
            const { svc, authIdentity } = makeService(undefined);
            await svc.resolveOrDefault("t", "p");
            await svc.resolveOrDefault("t", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(1);
        });

        it("passes through the anonymous path (no token) without caching", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            await svc.resolveOrDefault(undefined, undefined);
            await svc.resolveOrDefault(undefined, undefined);
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledWith(undefined, undefined);
        });

        it("passes through when a token is given without a providerId", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            await svc.resolveOrDefault("t", undefined);
            await svc.resolveOrDefault("t", undefined);
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });
    });

    describe("hit / miss", () => {
        it("caches on miss and serves the second request from cache", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            await svc.resolveOrDefault("t", "p");
            await svc.resolveOrDefault("t", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(1);
        });

        it("serves the cached accessMap on a hit without rebuilding it", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            const resolvedMap = new Map([["resolved", true]]) as any;
            authIdentity.resolveOrDefault.mockResolvedValue(authResult({ accessMap: resolvedMap }));

            await svc.resolveOrDefault("t", "p"); // miss → cache
            const res = await svc.resolveOrDefault("t", "p"); // hit

            expect(getAccessMapSpy).not.toHaveBeenCalled();
            expect(res.userDetails.accessMap).toBe(resolvedMap);
        });

        it("returns the same identity on a hit as on the miss", async () => {
            const { svc } = makeService(cacheCfg);
            const miss = await svc.resolveOrDefault("t", "p");
            const hit = await svc.resolveOrDefault("t", "p");

            expect(hit.userDetails).toEqual(miss.userDetails);
            expect(hit.status).toBe(miss.status);
        });

        it("does not let a providerId containing ':' collide with another providerId/token pair", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            await svc.resolveOrDefault("c", "a:b"); // a plain "providerId:token" key would be "a:b:c"
            await svc.resolveOrDefault("b:c", "a"); // ...and so would this one
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });

        it("hands out a frozen jwtPayload on hits, isolated from the miss caller's copy", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            authIdentity.resolveOrDefault.mockResolvedValue(
                authResult({
                    jwtPayload: { exp: Math.floor(Date.now() / 1000) + 3600, aud: ["api"] },
                }),
            );

            const miss = await svc.resolveOrDefault("t", "p");
            (miss.userDetails.jwtPayload.aud as string[]).push("changed-by-miss-caller");

            const hit = await svc.resolveOrDefault("t", "p");
            expect(hit.userDetails.jwtPayload.aud).toEqual(["api"]);
            expect(() => (hit.userDetails.jwtPayload.sub = "x")).toThrow(
                /read only|not extensible/,
            );
            expect(() => (hit.userDetails.jwtPayload.aud as string[]).push("x")).toThrow(
                /read only|not extensible/,
            );
        });

        it("keys distinct tokens independently", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            await svc.resolveOrDefault("t1", "p");
            await svc.resolveOrDefault("t2", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });

        it("does not cache an already-expired token (ttl <= 0)", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            authIdentity.resolveOrDefault.mockResolvedValue(
                authResult({ jwtPayload: { exp: Math.floor(Date.now() / 1000) - 10 } }),
            );
            await svc.resolveOrDefault("t", "p");
            await svc.resolveOrDefault("t", "p");
            expect(authIdentity.resolveOrDefault).toHaveBeenCalledTimes(2);
        });

        it("does not cache thrown auth failures and propagates them", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
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

        it("clears on invalidate()", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            await seed(svc);
            svc.invalidate();
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on a User PermissionChange DeleteCmd (feed-based removal)", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
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
            const { svc, authIdentity, db } = makeService(cacheCfg);
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
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("update", { type: DocType.AuthProvider, _id: "ap1" });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on an AutoGroupMappings update", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("update", { type: DocType.AutoGroupMappings, _id: "m1" });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on disconnect", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("disconnect");
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on reconnect", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("reconnect");
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("does NOT clear on a plain User update (e.g. lastLogin write)", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("update", { type: DocType.User, _id: "user-1", lastLogin: 123 });
            expect(await isHit(svc, authIdentity)).toBe(true);
        });

        it("clears on a group change (cached accessMaps may be stale)", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("groupUpdate", { type: DocType.Group, _id: "g1" });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("clears on a group deletion", async () => {
            const { svc, authIdentity, db } = makeService(cacheCfg);
            await seed(svc);
            db.emit("groupUpdate", {
                type: DocType.DeleteCmd,
                deleteReason: DeleteReason.Deleted,
                docType: DocType.Group,
                docId: "g1",
            });
            expect(await isHit(svc, authIdentity)).toBe(false);
        });

        it("does not cache a result whose resolve was in flight when the cache was invalidated", async () => {
            const { svc, authIdentity } = makeService(cacheCfg);
            let release: () => void;
            const gate = new Promise<void>((r) => (release = r));
            authIdentity.resolveOrDefault.mockImplementationOnce(async () => {
                await gate;
                return authResult({ groups: ["g1", "g2"] });
            });

            const inFlight = svc.resolveOrDefault("t", "p");
            svc.invalidate();
            release();
            await inFlight;

            expect(await isHit(svc, authIdentity)).toBe(false);
        });
    });

    describe("clock (injected, shared with the cache)", () => {
        const BASE = 1_700_000_000_000; // fixed ms base so exp is relative to the fake clock

        it("expires a hit once the injected clock passes the TTL (capped by maxAge)", async () => {
            let clock = BASE;
            const { svc, authIdentity } = makeService(cacheCfg, () => clock);
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
            const { svc, authIdentity } = makeService(cacheCfg, () => clock);
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
