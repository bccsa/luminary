jest.mock("nano", () => jest.fn());

import * as nano from "nano";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { UserDataDbService } from "./userDataDb.service";
import { UserActivityDto } from "../dto/UserActivityDto";
import { userActivityDocumentId } from "./activityIdentity";
import { UserActivityType } from "../enums";

describe("UserDataDbService (mocked nano)", () => {
    const missing = () => Object.assign(new Error("missing"), { statusCode: 404 });
    const conflict = () => Object.assign(new Error("conflict"), { statusCode: 409 });
    const activity: UserActivityDto = {
        _id: userActivityDocumentId({ type: "liked", parentId: "page-privacy-policy" }),
        type: UserActivityType.Liked,
        parentId: "page-privacy-policy",
        activityTimeUtc: 123,
    };
    let docs: Map<string, any>;
    let handle: {
        info: jest.Mock;
        get: jest.Mock;
        insert: jest.Mock;
        partitionedFind: jest.Mock;
        list: jest.Mock;
    };
    let config: ConfigService;
    let logger: any;
    let service: UserDataDbService;

    beforeEach(() => {
        jest.clearAllMocks();
        docs = new Map();
        handle = {
            list: jest.fn(),
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

    it("applies its partitioned design document before enabling the source", async () => {
        expect(service.enabled).toBe(false);
        await service.initialize();
        expect(handle.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                _id: "_design/sync-liked-index",
                options: { partitioned: true },
            }),
        );
        expect(service.enabled).toBe(true);
        expect(handle.list).not.toHaveBeenCalled();
        expect(handle.get.mock.calls.every(([id]) => id.startsWith("_design/"))).toBe(true);
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
        const query = { selector: { type: "liked" } };
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
        const identity = {
            type: "highlighted" as const,
            parentId: "post",
            contentId: "content:a",
            range: { start: 1, end: 20, color: "blue", text: "passage" },
        };
        const passage: UserActivityDto = {
            ...identity,
            _id: userActivityDocumentId(identity),
            type: UserActivityType.Highlighted,
            range: { ...identity.range, color: "blue" as any },
            activityTimeUtc: 123,
        };
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
                const doc: UserActivityDto = {
                    _id: userActivityDocumentId({ type: "viewed", parentId: `post-${i}` }),
                    type: UserActivityType.Viewed,
                    parentId: `post-${i}`,
                    activityTimeUtc: i,
                };
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

    it("bounds conflict retries without reporting a successful write", async () => {
        await service.initialize();
        handle.get.mockClear();
        handle.insert.mockReset().mockRejectedValue(conflict());
        await expect(service.upsert("owner-a", activity, 0)).rejects.toMatchObject({
            statusCode: 409,
        });
        expect(handle.get).toHaveBeenCalledTimes(1);
        expect(handle.insert).toHaveBeenCalledTimes(1);
    });

    it("keeps the newest activity under simultaneous writes to the same owner and id", async () => {
        await service.initialize();
        handle.insert.mockImplementation(async (doc) => {
            const previous = docs.get(doc._id);
            if (previous ? doc._rev !== previous._rev : doc._rev !== undefined) throw conflict();
            const rev = `${Number(previous?._rev.split("-")[0] ?? 0) + 1}-server`;
            docs.set(doc._id, { ...doc, _rev: rev });
            return { ok: true, id: doc._id, rev };
        });
        await Promise.all(
            [120, 150, 130, 140].map((activityTimeUtc) =>
                service.upsert("owner-a", { ...activity, activityTimeUtc }),
            ),
        );
        expect(docs.get(`owner-a:${activity._id}`).activityTimeUtc).toBe(150);
        expect(nano).toHaveBeenCalledTimes(1);
    });
});
