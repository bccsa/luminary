jest.mock("nano", () => jest.fn());

import * as nano from "nano";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { UserDataDbService } from "./userDataDb.service";
import { UserActivityDto } from "../dto/UserActivityDto";

describe("UserDataDbService (mocked nano)", () => {
    const missing = () => Object.assign(new Error("missing"), { statusCode: 404 });
    const conflict = () => Object.assign(new Error("conflict"), { statusCode: 409 });
    const activity: UserActivityDto = {
        _id: "liked:page-privacy-policy",
        type: "userActivity",
        activityType: "liked",
        parentId: "page-privacy-policy",
        activityTimeUtc: 123,
    };
    let docs: Map<string, any>;
    let handle: { info: jest.Mock; get: jest.Mock; insert: jest.Mock; partitionedFind: jest.Mock };
    let config: ConfigService;
    let logger: any;
    let service: UserDataDbService;

    beforeEach(() => {
        jest.clearAllMocks();
        docs = new Map();
        handle = {
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
        expect(result.doc._id).toBe("owner-a:liked:page-privacy-policy");
        expect(result.doc.updatedTimeUtc).toBeGreaterThanOrEqual(before);
        expect(result.doc.activityTimeUtc).toBe(123);
        expect(activity._id).toBe("liked:page-privacy-policy");
    });

    it("preserves ids containing several colons", async () => {
        await service.initialize();
        const result = await service.upsert("owner-a", {
            ...activity,
            _id: "highlighted:content:a:1-20",
        });
        expect(result.doc._id).toBe("owner-a:highlighted:content:a:1-20");
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
});
