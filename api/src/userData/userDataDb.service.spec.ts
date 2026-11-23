jest.mock("nano", () => jest.fn());

import * as nano from "nano";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { UserDataDbService } from "./userDataDb.service";
import { UserActivityDto } from "../dto/UserActivityDto";
import { normalizeUserActivityDocument } from "./activityIdentity";

describe("UserDataDbService (mocked nano)", () => {
    const missing = () => Object.assign(new Error("missing"), { statusCode: 404 });
    const conflict = () => Object.assign(new Error("conflict"), { statusCode: 409 });
    const activity: UserActivityDto = normalizeUserActivityDocument({
        _id: "liked:page-privacy-policy",
        type: "userActivity",
        activityType: "liked",
        parentId: "page-privacy-policy",
        activityTimeUtc: 123,
    });
    let docs: Map<string, any>;
    let handle: {
        info: jest.Mock;
        get: jest.Mock;
        insert: jest.Mock;
        partitionedFind: jest.Mock;
        list: jest.Mock;
        destroy: jest.Mock;
    };
    let config: ConfigService;
    let logger: any;
    let service: UserDataDbService;

    beforeEach(() => {
        jest.clearAllMocks();
        docs = new Map();
        handle = {
            list: jest.fn(async (options) => ({
                rows: [...docs.entries()]
                    .filter(
                        ([id]) =>
                            !id.startsWith("_local/") &&
                            (!options.startkey || id > options.startkey),
                    )
                    .sort(([a], [b]) => a.localeCompare(b))
                    .slice(0, options.limit)
                    .map(([id, doc]) => ({ id, doc })),
            })),
            destroy: jest.fn(async (id) => {
                docs.delete(id);
                return { ok: true };
            }),
            info: jest.fn().mockResolvedValue({ props: { partitioned: true } }),
            get: jest.fn(async (id) => {
                if (!docs.has(id)) throw missing();
                return JSON.parse(JSON.stringify(docs.get(id)));
            }),
            insert: jest.fn(async (doc) => {
                const stored = { ...JSON.parse(JSON.stringify(doc)), _rev: "2-server" };
                docs.set(doc._id, stored);
                return { ok: true, id: doc._id, rev: stored._rev };
            }),
            partitionedFind: jest.fn().mockResolvedValue({ docs: [] }),
        };
        (nano as unknown as jest.Mock).mockReturnValue({ use: jest.fn().mockReturnValue(handle) });
        config = new ConfigService({
            database: { connectionString: "http://localhost:5984", database: "shared" },
            userData: { database: "user-data", idSecret: "test-secret" },
        });
        logger = { error: jest.fn(), info: jest.fn() };
        service = new UserDataDbService(config, logger);
    });

    it("does no network work before initialization, or when disabled", async () => {
        expect(nano).not.toHaveBeenCalled();
        config.set("userData", {});
        await service.initialize();
        expect(nano).not.toHaveBeenCalled();
        expect(service.enabled).toBe(false);
        expect(() => service.assertEnabled()).toThrow(ServiceUnavailableException);
    });

    it("migrates legacy ids across pages without changing partitions or resurrecting removals", async () => {
        for (let i = 0; i < 125; i++) {
            const parentId = `post-${String(i).padStart(3, "0")}`;
            const old = {
                _id: `owner-a:liked:${parentId}`,
                type: "userActivity",
                activityType: "liked",
                parentId,
                activityTimeUtc: 100,
                _rev: "1-old",
            };
            docs.set(old._id, old);
        }
        const kept = normalizeUserActivityDocument({
            _id: "liked:post-000",
            type: "userActivity",
            activityType: "liked",
            parentId: "post-000",
            activityTimeUtc: 100,
            deleted: true,
        });
        docs.set(`owner-a:${kept._id}`, { ...kept, _id: `owner-a:${kept._id}`, _rev: "2-new" });
        await service.initialize();

        expect(service.enabled).toBe(true);
        const activities = [...docs.values()].filter((doc) => doc.type === "liked");
        expect(activities).toHaveLength(125);
        expect(activities.every((doc) => /^owner-a:[a-f0-9-]{36}$/.test(doc._id))).toBe(true);
        expect(docs.get(`owner-a:${kept._id}`).deleted).toBe(true);
        expect([...docs.values()].some((doc) => doc.type === "userActivity")).toBe(false);
        expect(docs.get("_local/userActivityFormat-v2").format).toBe(2);
        handle.list.mockClear();
        service = new UserDataDbService(config, logger);
        await service.initialize();
        expect(handle.list).not.toHaveBeenCalled();
    });

    it.each([
        { database: "user-data" },
        { idSecret: "secret" },
        { database: "shared", idSecret: "secret" },
    ])("disables incomplete or shared-database configuration", async (settings) => {
        config.set("userData", settings);
        await service.initialize();
        expect(service.enabled).toBe(false);
        expect(nano).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });

    it("keeps migration failures disabled and resumes without mixing accounts", async () => {
        for (const [owner, activityTimeUtc] of [
            ["owner-a", 100],
            ["owner-b", 200],
        ] as const) {
            const _id = `${owner}:liked:post-1`;
            docs.set(_id, {
                _id,
                _rev: "1-old",
                type: "userActivity",
                activityType: "liked",
                parentId: "post-1",
                activityTimeUtc,
            });
        }
        handle.destroy.mockRejectedValueOnce(new Error("interrupted"));
        await service.initialize();
        expect(service.enabled).toBe(false);
        expect(docs.has("_local/userActivityFormat-v2")).toBe(false);
        expect(docs.has("owner-a:liked:post-1")).toBe(true);

        service = new UserDataDbService(config, logger);
        await service.initialize();
        expect(service.enabled).toBe(true);
        const canonical = [...docs.values()].filter((doc) => doc.type === "liked");
        expect(canonical).toHaveLength(2);
        expect(canonical.find((doc) => doc._id.startsWith("owner-a:")).activityTimeUtc).toBe(100);
        expect(canonical.find((doc) => doc._id.startsWith("owner-b:")).activityTimeUtc).toBe(200);
        expect(canonical[0]._id.split(":")[1]).toBe(canonical[1]._id.split(":")[1]);
        expect([...docs.values()].some((doc) => doc.type === "userActivity")).toBe(false);
    });

    it("preserves a concurrent equal-time tombstone when migration retries a conflict", async () => {
        const old = {
            _id: "owner-a:liked:post-1",
            _rev: "1-old",
            type: "userActivity",
            activityType: "liked",
            parentId: "post-1",
            activityTimeUtc: 100,
        };
        docs.set(old._id, old);
        const insert = handle.insert.getMockImplementation()!;
        let raced = false;
        handle.insert.mockImplementation(async (doc) => {
            if (doc.type === "liked" && !raced) {
                raced = true;
                docs.set(doc._id, { ...doc, deleted: true, _rev: "2-removal" });
                throw conflict();
            }
            return insert(doc);
        });
        await service.initialize();
        expect(service.enabled).toBe(true);
        expect([...docs.values()].find((doc) => doc.type === "liked").deleted).toBe(true);
        expect(docs.has(old._id)).toBe(false);
    });

    it("applies its partitioned design document before enabling the source", async () => {
        expect(service.enabled).toBe(false);
        await service.initialize();
        expect(handle.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: "_design/sync-userActivity-index",
                options: { partitioned: true },
            }),
        );
        expect(service.enabled).toBe(true);
        expect((nano as unknown as jest.Mock).mock.results[0].value.use).toHaveBeenCalledWith(
            "user-data",
        );
    });

    it("leaves an existing identical design document untouched", async () => {
        await service.initialize();
        handle.insert.mockClear();
        service = new UserDataDbService(config, logger);
        await service.initialize();
        expect(handle.insert).not.toHaveBeenCalled();
        expect(service.enabled).toBe(true);
    });

    it("keeps the source off for a missing database without retrying", async () => {
        handle.info.mockRejectedValue(missing());
        await service.initialize();
        expect(handle.info).toHaveBeenCalledTimes(1);
        expect(handle.insert).not.toHaveBeenCalled();
        expect(service.enabled).toBe(false);
        expect(logger.error).toHaveBeenCalled();
    });

    it("keeps the source off for a non-partitioned database", async () => {
        handle.info.mockResolvedValue({ props: { partitioned: false } });
        await service.initialize();
        expect(handle.insert).not.toHaveBeenCalled();
        expect(service.enabled).toBe(false);
    });

    it("keeps the source off when design-doc installation fails", async () => {
        handle.insert.mockRejectedValue(Object.assign(new Error("forbidden"), { statusCode: 403 }));
        await service.initialize();
        expect(service.enabled).toBe(false);
    });

    it("uses nano's partition path for every query", async () => {
        await service.initialize();
        const query = { selector: { type: "userActivity" } };
        await service.partitionedFind("owner-a", query);
        expect(handle.partitionedFind).toHaveBeenCalledWith("owner-a", query);
    });

    it("prefixes only the document id and assigns the server timestamp", async () => {
        await service.initialize();
        const before = Date.now();
        const result = await service.upsert("owner-a", activity);
        expect(result.doc._id).toBe(`owner-a:${activity._id}`);
        expect(result.doc.updatedTimeUtc).toBeGreaterThanOrEqual(before);
        expect(result.doc.activityTimeUtc).toBe(123);
        expect(activity._id).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("preserves legacy content references containing several colons", async () => {
        await service.initialize();
        const passage = normalizeUserActivityDocument({
            _id: "highlighted:content:a:1-20",
            type: "userActivity",
            activityType: "highlighted",
            parentId: "post",
            contentId: "content:a",
            activityTimeUtc: 123,
            payload: { range: { start: 1, end: 20, color: "blue", text: "passage" } },
        });
        const result = await service.upsert("owner-a", passage);
        expect(result.doc._id).toBe(`owner-a:${passage._id}`);
        expect(result.doc).toMatchObject({ contentId: "content:a" });
    });

    it("rejects an older activity and skips an identical retry", async () => {
        await service.initialize();
        const stored = (await service.upsert("owner-a", activity)).doc;
        handle.insert.mockClear();
        expect(await service.upsert("owner-a", { ...activity, activityTimeUtc: 122 })).toEqual({
            stale: true,
            doc: stored,
        });
        expect(await service.upsert("owner-a", activity)).toEqual({ stale: false, doc: stored });
        expect(handle.insert).not.toHaveBeenCalled();
    });

    it("rechecks activity time after a conflict instead of overwriting a concurrent newer write", async () => {
        await service.initialize();
        handle.insert.mockImplementationOnce(async (doc) => {
            docs.set(doc._id, { ...doc, activityTimeUtc: 999, _rev: "3-other" });
            throw conflict();
        });
        const result = await service.upsert("owner-a", activity);
        expect(result.stale).toBe(true);
        expect(result.doc.activityTimeUtc).toBe(999);
    });

    it("retries a conflict with the current revision when the submitted activity is newer", async () => {
        await service.initialize();
        handle.insert.mockImplementationOnce(async (doc) => {
            docs.set(doc._id, { ...doc, activityTimeUtc: 100, _rev: "3-other" });
            throw conflict();
        });
        const result = await service.upsert("owner-a", activity);
        expect(result.stale).toBe(false);
        expect(handle.insert).toHaveBeenLastCalledWith(
            expect.objectContaining({ _rev: "3-other", activityTimeUtc: 123 }),
        );
    });

    it("does not turn read failures into creation attempts", async () => {
        await service.initialize();
        handle.insert.mockClear();
        handle.get.mockRejectedValue(new Error("connection failed"));
        await expect(service.upsert("owner-a", activity)).rejects.toThrow("connection failed");
        expect(handle.insert).not.toHaveBeenCalled();
    });

    it("shares one initialization and one connection across concurrent calls and activity requests", async () => {
        let ready: (info: any) => void;
        handle.info.mockReturnValue(
            new Promise((resolve) => {
                ready = resolve;
            }),
        );
        const starts = Array.from({ length: 20 }, () => service.initialize());
        expect(starts.every((start) => start === starts[0])).toBe(true);
        expect(nano).toHaveBeenCalledTimes(1);
        expect(handle.info).toHaveBeenCalledTimes(1);
        expect(service.enabled).toBe(false);
        expect(() => service.assertEnabled()).toThrow(ServiceUnavailableException);
        ready({ props: { partitioned: true } });
        await Promise.all(starts);
        handle.list.mockClear();
        handle.get.mockClear();
        handle.insert.mockClear();

        await Promise.all(
            Array.from({ length: 100 }, async (_, i) => {
                const doc = normalizeUserActivityDocument({
                    _id: `viewed:post-${i}`,
                    type: "userActivity",
                    activityType: "viewed",
                    parentId: `post-${i}`,
                    activityTimeUtc: i,
                });
                await service.upsert("owner-a", doc);
                await service.partitionedFind("owner-a", {
                    selector: { type: "viewed" },
                    use_index: "sync-viewed-index",
                });
            }),
        );
        await service.initialize();
        expect(nano).toHaveBeenCalledTimes(1);
        expect(handle.info).toHaveBeenCalledTimes(1);
        expect(handle.list).not.toHaveBeenCalled();
        expect(handle.get).toHaveBeenCalledTimes(100);
        expect(handle.insert).toHaveBeenCalledTimes(100);
        expect(handle.partitionedFind).toHaveBeenCalledTimes(100);
    });

    it("retries failed initialization only on a new service instance", async () => {
        handle.info.mockRejectedValueOnce(missing());
        await service.initialize();
        await service.initialize();
        expect(service.enabled).toBe(false);
        expect(nano).toHaveBeenCalledTimes(1);
        expect(handle.info).toHaveBeenCalledTimes(1);

        service = new UserDataDbService(config, logger);
        await service.initialize();
        expect(service.enabled).toBe(true);
        expect(nano).toHaveBeenCalledTimes(2);
    });
});
