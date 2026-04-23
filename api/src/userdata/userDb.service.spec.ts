import { ForbiddenException } from "@nestjs/common";
import { jest } from "@jest/globals";
import { UserDbService, UserDataDoc } from "./userDb.service";
import { DocType, DeleteReason } from "../enums";
import { UserContentDto } from "../dto/UserContentDto";
import { UserSettingsDto } from "../dto/UserSettingsDto";
import { EventEmitter } from "stream";

/**
 * Unit tests for the UserDbService security boundary + merge-on-write logic.
 * The service's public methods delegate to `this.db` (a nano DocumentScope)
 * which we mock directly. Bootstrap is bypassed — we set `ready = true`
 * and install the mock db post-construction.
 */
describe("UserDbService", () => {
    const dbName = "test-userdata";
    const connectionString = "http://localhost:5984";

    /**
     * Build a fresh service with a mocked `this.db`. Returns both the
     * service and the mock so tests can assert on calls.
     */
    function makeService() {
        const logger: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const configService: any = {
            get: jest.fn(() => ({
                connectionString,
                database: "content",
                userDataDatabase: dbName,
                maxSockets: 10,
            })),
        };
        const dbService: any = new EventEmitter();

        const service = new UserDbService(logger, configService, dbService);
        const mockDb = {
            get: jest.fn<any>(),
            insert: jest.fn<any>().mockResolvedValue({ id: "mock-id", rev: "mock-rev", ok: true }),
            destroy: jest.fn<any>().mockResolvedValue({ ok: true }),
            partitionedFind: jest.fn<any>().mockResolvedValue({ docs: [] }),
            partitionedList: jest.fn<any>().mockResolvedValue({ rows: [] }),
            bulk: jest.fn<any>().mockResolvedValue([]),
        };
        (service as any).db = mockDb;
        (service as any).ready = true;
        return { service, mockDb, dbService, logger };
    }

    const userAlice = "usr_alice";
    const userBob = "usr_bob";

    function baseUserContent(userId: string, contentId: string): UserContentDto {
        return {
            _id: `${userId}:userContent:${contentId}`,
            type: DocType.UserContent,
            userId,
            contentId,
            createdAt: 1000,
            updatedTimeUtc: 1000,
        } as UserContentDto;
    }

    function baseUserSettings(userId: string): UserSettingsDto {
        return {
            _id: `${userId}:settings`,
            type: DocType.UserSettings,
            userId,
            createdAt: 1000,
            updatedTimeUtc: 1000,
        } as UserSettingsDto;
    }

    describe("partition ownership invariants", () => {
        it("rejects upsert when _id prefix does not match userId", async () => {
            const { service } = makeService();
            const doc = baseUserContent(userBob, "cnt_x"); // id belongs to Bob
            await expect(
                service.upsertInPartition(userAlice, doc),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("rejects upsert when userId field does not match caller", async () => {
            const { service } = makeService();
            const doc = baseUserContent(userAlice, "cnt_x");
            (doc as any).userId = userBob; // _id is Alice's but field claims Bob
            await expect(
                service.upsertInPartition(userAlice, doc),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("rejects getDocInPartition for another user's doc id", async () => {
            const { service } = makeService();
            await expect(
                service.getDocInPartition(userAlice, `${userBob}:userContent:x`),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("rejects softDeleteInPartition for another user's doc id", async () => {
            const { service } = makeService();
            await expect(
                service.softDeleteInPartition(userAlice, `${userBob}:settings`),
            ).rejects.toBeInstanceOf(ForbiddenException);
        });

        it("accepts upsert when _id and userId both match caller", async () => {
            const { service, mockDb } = makeService();
            mockDb.get.mockRejectedValueOnce({ statusCode: 404 }); // no existing doc
            const doc = baseUserContent(userAlice, "cnt_x");
            await expect(service.upsertInPartition(userAlice, doc)).resolves.toBeDefined();
            expect(mockDb.insert).toHaveBeenCalled();
        });
    });

    describe("merge-on-write: UserContent highlights", () => {
        it("unions highlights by id across current and incoming", async () => {
            const { service, mockDb } = makeService();
            const current: UserContentDto = {
                ...baseUserContent(userAlice, "cnt_x"),
                highlights: [
                    { id: "h1", color: "yellow", text: "one", position: 0, createdAt: 1000 },
                    { id: "h2", color: "yellow", text: "two", position: 10, createdAt: 1000 },
                ],
                updatedTimeUtc: 1000,
            };
            mockDb.get.mockResolvedValueOnce(current);

            const incoming: UserContentDto = {
                ...baseUserContent(userAlice, "cnt_x"),
                highlights: [
                    { id: "h2", color: "yellow", text: "two", position: 10, createdAt: 1000 },
                    { id: "h3", color: "red", text: "three", position: 20, createdAt: 2000 },
                ],
                updatedTimeUtc: 2000,
            };

            await service.upsertInPartition(userAlice, incoming);

            const written = mockDb.insert.mock.calls[0][0] as UserContentDto;
            const ids = (written.highlights ?? []).map((h) => h.id).sort();
            expect(ids).toEqual(["h1", "h2", "h3"]);
        });

        it("takes newer readingPos on UserContent by updatedTimeUtc (LWW)", async () => {
            const { service, mockDb } = makeService();
            const current: UserContentDto = {
                ...baseUserContent(userAlice, "cnt_x"),
                readingPos: 25,
                updatedTimeUtc: 2000,
            };
            mockDb.get.mockResolvedValueOnce(current);

            const incoming: UserContentDto = {
                ...baseUserContent(userAlice, "cnt_x"),
                readingPos: 10,
                updatedTimeUtc: 1000, // older — should lose
            };

            await service.upsertInPartition(userAlice, incoming);

            const written = mockDb.insert.mock.calls[0][0] as UserContentDto;
            expect(written.readingPos).toBe(25); // current wins
            expect(written.updatedTimeUtc).toBe(2000); // max of the two
        });

        it("preserves _rev and createdAt from current on merge", async () => {
            const { service, mockDb } = makeService();
            const current: UserContentDto = {
                ...baseUserContent(userAlice, "cnt_x"),
                createdAt: 100,
                updatedTimeUtc: 2000,
                _rev: "7-abc",
            } as any;
            mockDb.get.mockResolvedValueOnce(current);

            const incoming: UserContentDto = {
                ...baseUserContent(userAlice, "cnt_x"),
                createdAt: 99999, // client lied about createdAt
                updatedTimeUtc: 3000,
            };

            await service.upsertInPartition(userAlice, incoming);

            const written = mockDb.insert.mock.calls[0][0] as any;
            expect(written._rev).toBe("7-abc");
            expect(written.createdAt).toBe(100); // preserved, not overwritten
        });
    });

    describe("merge-on-write: UserSettings (plain LWW)", () => {
        it("overwrites fields when incoming is newer", async () => {
            const { service, mockDb } = makeService();
            const current: UserSettingsDto = {
                ...baseUserSettings(userAlice),
                privacyPolicyAccepted: false,
                updatedTimeUtc: 1000,
            };
            mockDb.get.mockResolvedValueOnce(current);

            const incoming: UserSettingsDto = {
                ...baseUserSettings(userAlice),
                privacyPolicyAccepted: true,
                updatedTimeUtc: 2000,
            };

            await service.upsertInPartition(userAlice, incoming);

            const written = mockDb.insert.mock.calls[0][0] as UserSettingsDto;
            expect(written.privacyPolicyAccepted).toBe(true);
        });

        it("keeps current when incoming is older (LWW)", async () => {
            const { service, mockDb } = makeService();
            const current: UserSettingsDto = {
                ...baseUserSettings(userAlice),
                privacyPolicyAccepted: true,
                updatedTimeUtc: 2000,
            };
            mockDb.get.mockResolvedValueOnce(current);

            const incoming: UserSettingsDto = {
                ...baseUserSettings(userAlice),
                privacyPolicyAccepted: false,
                updatedTimeUtc: 1000, // older
            };

            await service.upsertInPartition(userAlice, incoming);

            const written = mockDb.insert.mock.calls[0][0] as UserSettingsDto;
            expect(written.privacyPolicyAccepted).toBe(true);
        });
    });

    describe("first write (no existing doc)", () => {
        it("inserts incoming as-is after stripping _rev", async () => {
            const { service, mockDb } = makeService();
            mockDb.get.mockRejectedValueOnce({ statusCode: 404 });

            const doc = {
                ...baseUserContent(userAlice, "cnt_x"),
                _rev: "client-should-not-set-this",
            } as any;

            await service.upsertInPartition(userAlice, doc);

            const written = mockDb.insert.mock.calls[0][0] as any;
            expect(written._rev).toBeUndefined();
        });
    });

    describe("cascade user-delete sweep", () => {
        it("sweeps partition when DbService emits DeleteCmd for a User doc", async () => {
            const { service, mockDb, dbService } = makeService();
            mockDb.partitionedList.mockResolvedValueOnce({
                rows: [
                    { id: `${userAlice}:settings`, value: { rev: "1-a" } },
                    { id: `${userAlice}:userContent:cnt_x`, value: { rev: "2-b" } },
                ],
            });

            // Service subscribes to DbService events in onModuleInit; since
            // we bypass that, call the private method directly instead of
            // re-wiring the subscription just for the test.
            await (service as any).sweepUserPartition(userAlice);

            expect(mockDb.bulk).toHaveBeenCalledTimes(1);
            const bulkArg = mockDb.bulk.mock.calls[0][0] as any;
            expect(bulkArg.docs).toHaveLength(2);
            for (const d of bulkArg.docs) {
                expect(d._deleted).toBe(true);
            }
        });

        it("skips _design/ docs so partitioned index defs are not removed", async () => {
            const { service, mockDb } = makeService();
            mockDb.partitionedList.mockResolvedValueOnce({
                rows: [
                    { id: `${userAlice}:settings`, value: { rev: "1-a" } },
                    { id: "_design/userdata-type-idx", value: { rev: "3-design" } },
                ],
            });

            await (service as any).sweepUserPartition(userAlice);

            const bulkArg = mockDb.bulk.mock.calls[0][0] as any;
            expect(bulkArg.docs).toHaveLength(1);
            expect(bulkArg.docs[0]._id).toBe(`${userAlice}:settings`);
        });

        it("is a no-op on an empty partition", async () => {
            const { service, mockDb } = makeService();
            mockDb.partitionedList.mockResolvedValueOnce({ rows: [] });

            await (service as any).sweepUserPartition(userAlice);

            expect(mockDb.bulk).not.toHaveBeenCalled();
        });

        it("subscribes to DbService and triggers sweep for User DeleteCmd", async () => {
            const { service, mockDb, dbService } = makeService();
            mockDb.partitionedList.mockResolvedValue({
                rows: [{ id: `${userAlice}:settings`, value: { rev: "1-a" } }],
            });

            // Manually invoke the subscription wiring — onModuleInit is
            // skipped in tests, but the subscription itself is the unit
            // we want to verify.
            (service as any).subscribeToUserDeletes();

            dbService.emit("update", {
                type: DocType.DeleteCmd,
                docId: userAlice,
                docType: DocType.User,
                deleteReason: DeleteReason.Deleted,
            });

            // sweep is fire-and-forget; wait a microtask for it to run.
            await new Promise((r) => setImmediate(r));
            expect(mockDb.partitionedList).toHaveBeenCalledWith(userAlice, expect.anything());
            expect(mockDb.bulk).toHaveBeenCalled();
        });

        it("ignores DeleteCmds for non-User doc types", async () => {
            const { service, mockDb, dbService } = makeService();
            (service as any).subscribeToUserDeletes();

            dbService.emit("update", {
                type: DocType.DeleteCmd,
                docId: "some_post",
                docType: DocType.Post,
                deleteReason: DeleteReason.Deleted,
            });

            await new Promise((r) => setImmediate(r));
            expect(mockDb.partitionedList).not.toHaveBeenCalled();
        });

        it("ignores User DeleteCmds with non-Deleted reason (e.g. PermissionChange)", async () => {
            const { service, mockDb, dbService } = makeService();
            (service as any).subscribeToUserDeletes();

            dbService.emit("update", {
                type: DocType.DeleteCmd,
                docId: userAlice,
                docType: DocType.User,
                deleteReason: DeleteReason.PermissionChange,
            });

            await new Promise((r) => setImmediate(r));
            expect(mockDb.partitionedList).not.toHaveBeenCalled();
        });
    });
});
