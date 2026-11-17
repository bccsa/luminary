import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { DocType, type BaseDocumentDto } from "../types";
import { initConfig } from "../config";
import { initDatabase } from "../db/database";
import { dataSources, isConnected } from "../socket/socketio";
import { createDataSource, type DataSourceHandle } from "./dataSource";
import * as RestApi from "./RestApi";
import { initSync, setCancelSync } from "./sync";
import { syncList as defaultSyncList, syncActive } from "./sync/state";
import type { HttpReq } from "./http";

const changeRequestMock = vi.fn();
const http = { post: vi.fn() };
const makeDoc = (id: string, updatedTimeUtc: number): BaseDocumentDto => ({
    _id: id,
    type: DocType.UserActivity,
    updatedTimeUtc,
    memberOf: ["*"],
});

let databaseNumber = 0;
let handles: DataSourceHandle[] = [];
const create = async (databaseName = `source-test-${++databaseNumber}`, paceMs = 0) => {
    const enabled = ref(false);
    const source = await createDataSource({
        name: "user",
        databaseName,
        syncListKey: "syncList",
        sync: { type: DocType.UserActivity, limit: 2 },
        ready: enabled,
        paceMs,
    });
    handles.push(source);
    return { source, enabled };
};
const connect = () => {
    isConnected.value = true;
    dataSources.value = ["user"];
};
const acknowledge = (form: FormData) => ({
    id: JSON.parse(form.get("changeRequest__json") as string).id,
    ack: "accepted",
});

describe("createDataSource", () => {
    beforeAll(async () => {
        initConfig({
            cms: true,
            docsIndex: "parentId, language, [type+docType]",
            apiUrl: "http://localhost:12344",
            appLanguageIdsAsRef: ref([]),
        });
        await initDatabase();
        await initSync(http as unknown as HttpReq<any>);
        vi.spyOn(RestApi, "getRest").mockReturnValue({
            changeRequest: changeRequestMock,
        } as unknown as ReturnType<typeof RestApi.getRest>);
    });

    beforeEach(() => {
        http.post.mockReset().mockResolvedValue({ docs: [] });
        changeRequestMock.mockReset().mockImplementation(acknowledge);
        setCancelSync(false);
        defaultSyncList.value = [];
    });

    afterEach(async () => {
        isConnected.value = false;
        dataSources.value = [];
        for (const source of handles) {
            await source.clear();
            await source.dispose();
        }
        handles = [];
    });

    it("sends neither queries nor changes until advertised and enabled", async () => {
        const { source, enabled } = await create();
        await source.db.upsert({ doc: makeDoc("liked:one", 1), overwriteLocalChanges: true });
        isConnected.value = true;
        enabled.value = true;
        await source.pull();
        expect(await source.flush(20)).toBe(false);
        expect(changeRequestMock).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();

        enabled.value = false;
        dataSources.value = ["user"];
        await source.pull();
        expect(await source.flush(20)).toBe(false);
        expect(changeRequestMock).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();

        enabled.value = true;
        await waitForExpect(async () => {
            expect(await source.db.localChanges.count()).toBe(0);
            expect(changeRequestMock).toHaveBeenCalledTimes(1);
            expect(http.post).toHaveBeenCalled();
        });
        const payload = JSON.parse(changeRequestMock.mock.calls[0][0].get("changeRequest__json"));
        expect(payload.dataSource).toBe("user");
        expect(http.post.mock.calls[0][1]).toMatchObject({ dataSource: "user" });
        expect(http.post.mock.calls[0][1].selector).not.toHaveProperty("memberOf");
    });

    it("persists a page before interruption and resumes the real engine after reopening", async () => {
        const docs = [5000, 4000, 3000, 2000, 1000].map((time) => makeDoc(`viewed:${time}`, time));
        const answer = (_path: string, query: any) => ({
            docs: docs
                .filter(
                    (doc) =>
                        doc.updatedTimeUtc <= query.selector.updatedTimeUtc.$lte &&
                        doc.updatedTimeUtc >= query.selector.updatedTimeUtc.$gte,
                )
                .slice(0, query.limit),
        });
        http.post.mockImplementationOnce(answer).mockRejectedValueOnce(new Error("interrupted"));
        const { source, enabled } = await create("source-interruption-test");
        connect();
        enabled.value = true;
        await waitForExpect(() => expect(http.post).toHaveBeenCalledTimes(2));
        await waitForExpect(async () => {
            expect(await source.db.getLuminaryInternals("syncList")).toEqual([
                expect.objectContaining({ blockStart: 5000, blockEnd: 4000, eof: false }),
            ]);
        });
        enabled.value = false;
        await source.dispose();
        handles = handles.filter((handle) => handle !== source);

        http.post.mockImplementation(answer);
        const reopened = await create("source-interruption-test");
        reopened.enabled.value = true;
        await waitForExpect(async () => {
            expect((await reopened.source.db.docs.toArray()).map((doc) => doc._id).sort()).toEqual(
                docs.map((doc) => doc._id).sort(),
            );
            expect(await reopened.source.db.getLuminaryInternals("syncList")).toEqual([
                expect.objectContaining({ blockStart: 5000, blockEnd: 0, eof: true }),
            ]);
        });
        expect(defaultSyncList.value).toEqual([]);
    });

    it.each(["pull", "flush"] as const)(
        "restarts a stalled queue on %s without mutating it",
        async (trigger) => {
            const { source, enabled } = await create();
            changeRequestMock.mockResolvedValue(undefined);
            await source.db.upsert({
                doc: makeDoc("liked:stalled", 10),
                overwriteLocalChanges: true,
            });
            connect();
            enabled.value = true;
            await waitForExpect(() => expect(changeRequestMock).toHaveBeenCalledTimes(3));
            expect(await source.db.localChanges.count()).toBe(1);
            expect(http.post).not.toHaveBeenCalled();
            changeRequestMock.mockImplementation(acknowledge);
            await source[trigger]();
            await waitForExpect(async () => {
                expect(await source.db.localChanges.count()).toBe(0);
                expect(changeRequestMock).toHaveBeenCalledTimes(4);
                expect(http.post).toHaveBeenCalled();
            });
        },
    );

    it("pulls again on foreground without requiring a socket reconnect", async () => {
        const { source, enabled } = await create();
        connect();
        enabled.value = true;
        await source.pull();
        const before = http.post.mock.calls.length;
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await waitForExpect(() => expect(http.post.mock.calls.length).toBeGreaterThan(before));
    });

    it("paces source uploads while draining a backlog", async () => {
        const { source, enabled } = await create(undefined, 100);
        const sentAt: number[] = [];
        changeRequestMock.mockImplementation((form: FormData) => {
            sentAt.push(Date.now());
            return acknowledge(form);
        });
        await source.db.upsert({ doc: makeDoc("liked:first", 1), overwriteLocalChanges: true });
        await source.db.upsert({ doc: makeDoc("liked:second", 2), overwriteLocalChanges: true });
        connect();
        enabled.value = true;
        expect(await source.flush(2000)).toBe(true);
        expect(sentAt).toHaveLength(2);
        expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(90);
    });

    it("drains only the enabled source's queue", async () => {
        const left = await create();
        const right = await create();
        await left.source.db.upsert({ doc: makeDoc("liked:left", 1), overwriteLocalChanges: true });
        await right.source.db.upsert({
            doc: makeDoc("liked:right", 2),
            overwriteLocalChanges: true,
        });
        connect();
        left.enabled.value = true;
        expect(await left.source.flush(2000)).toBe(true);
        expect(await left.source.db.localChanges.count()).toBe(0);
        expect(await right.source.db.localChanges.count()).toBe(1);
        expect(changeRequestMock).toHaveBeenCalledTimes(1);
    });

    it("replaces concurrent edits atomically with one queued change per document", async () => {
        const { source } = await create();
        await Promise.all(
            [1000, 2000, 3000].map((time) =>
                source.db.upsert({
                    doc: makeDoc("liked:concurrent", time),
                    overwriteLocalChanges: true,
                }),
            ),
        );
        const queued = await source.db.localChanges.toArray();
        expect(queued).toHaveLength(1);
        expect(queued[0].doc).toEqual(await source.db.docs.get("liked:concurrent"));
        expect(queued[0].doc?.updatedTimeUtc).toBe(3000);
    });

    it("does not overwrite an edit queued during an in-flight pull", async () => {
        let respond!: (value: { docs: BaseDocumentDto[] }) => void;
        http.post.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    respond = resolve;
                }),
        );
        changeRequestMock.mockResolvedValue(undefined);
        const { source, enabled } = await create();
        connect();
        enabled.value = true;
        await waitForExpect(() => expect(http.post).toHaveBeenCalledTimes(1));
        await source.db.upsert({ doc: makeDoc("liked:edited", 5000), overwriteLocalChanges: true });
        respond({ docs: [makeDoc("liked:edited", 1000)] });
        await waitForExpect(async () => {
            expect((await source.db.docs.get("liked:edited"))?.updatedTimeUtc).toBe(5000);
            expect(await source.db.getLuminaryInternals("syncList")).toBeDefined();
        });
    });

    it("discards an in-flight response after clear and leaves global sync activity alone", async () => {
        let respond!: (value: { docs: BaseDocumentDto[] }) => void;
        http.post.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    respond = resolve;
                }),
        );
        const { source, enabled } = await create();
        connect();
        enabled.value = true;
        await waitForExpect(() => expect(http.post).toHaveBeenCalledTimes(1));
        expect(syncActive.value).toBe(false);
        enabled.value = false;
        await source.clear();
        respond({ docs: [makeDoc("liked:old-owner", 1000)] });
        await source.pull();
        expect(await source.db.docs.count()).toBe(0);
        expect(await source.db.getLuminaryInternals("syncList")).toEqual([]);
    });
});
