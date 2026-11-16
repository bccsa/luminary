import "fake-indexeddb/auto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { DocType } from "../types";
import { initConfig } from "../config";
import { dataSources, isConnected } from "../socket/socketio";
import { createDataSource } from "./dataSource";
import * as RestApi from "./RestApi";
import { sync } from "./sync";

vi.mock("./sync", () => ({
    sync: vi.fn(),
}));

const changeRequestMock = vi.fn();
const USER_ACTIVITY_TYPE = "userActivity" as DocType;

const makeDoc = (id: string, updatedTimeUtc: number) => ({
    _id: id,
    type: USER_ACTIVITY_TYPE,
    updatedTimeUtc,
    memberOf: ["*"],
});

describe("createDataSource", () => {
    beforeAll(() => {
        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            apiUrl: "http://localhost:12344",
            appLanguageIdsAsRef: ref([]),
        });

        vi.spyOn(RestApi, "getRest").mockReturnValue({
            changeRequest: changeRequestMock,
        } as unknown as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
        dataSources.value = [];
        isConnected.value = false;
    });

    it("does not drain local changes until the source is advertised", async () => {
        const source = await createDataSource({
            name: "user",
            databaseName: "luminary-user-db-test-1",
            syncListKey: "syncList:user:test-1",
            sync: {
                type: USER_ACTIVITY_TYPE,
                limit: 100,
            },
        });

        try {
            isConnected.value = true;
            dataSources.value = [];

            changeRequestMock.mockResolvedValue({ id: 1, ack: "accepted" });
            await source.db.localChanges.put({
                id: 1,
                docId: "ua-1",
                doc: makeDoc("ua-1", 1),
            });

            await new Promise((resolve) => setTimeout(resolve, 200));
            expect(changeRequestMock).toHaveBeenCalledTimes(0);

            dataSources.value = ["user"];

            await waitForExpect(async () => {
                expect(changeRequestMock).toHaveBeenCalledTimes(1);
                expect(await source.db.localChanges.get(1)).toBeUndefined();
            });
        } finally {
            await source.clear();
            await source.dispose();
        }
    });

    it("converges after an interrupted multi-page pull without missing docs", async () => {
        const mockSync = vi.mocked(sync);
        let pullCount = 0;

        const source = await createDataSource({
            name: "user",
            databaseName: "luminary-user-db-test-2",
            syncListKey: "syncList:user:test-2",
            sync: {
                type: USER_ACTIVITY_TYPE,
                limit: 1,
            },
        });

        mockSync.mockImplementation(async (options: any) => {
            pullCount += 1;
            if (pullCount === 1) {
                await options.source.put([makeDoc("page-1", 1)]);
                throw new Error("interrupted");
            }
            await options.source.put([makeDoc("page-2", 2)]);
        });

        try {
            isConnected.value = true;
            dataSources.value = ["user"];

            await expect(source.pull()).rejects.toThrow("interrupted");
            await source.pull();

            const docs = await source.db.docs.toArray();
            const ids = docs.map((d) => d._id).sort();
            expect(ids).toEqual(["page-1", "page-2"]);
        } finally {
            await source.clear();
            await source.dispose();
        }
    });
});
