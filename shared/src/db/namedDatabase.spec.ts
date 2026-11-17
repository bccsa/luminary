import "fake-indexeddb/auto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ref } from "vue";
import waitForExpect from "wait-for-expect";
import { initConfig } from "../config";
import { dbUpgradeBlocked, openDatabase } from "./database";
import type { SyncListEntry } from "../api/sync/types";
import { AckStatus, DocType, type LocalChangeDto } from "../types";

type Connection = Awaited<ReturnType<typeof openDatabase>>;
let connections: Connection[] = [];
const open = async (name: string, docsIndex: string) => {
    const connection = await openDatabase({ name, docsIndex });
    connections.push(connection);
    return connection;
};

describe("named databases", () => {
    beforeAll(() => {
        initConfig({
            cms: true,
            docsIndex: "",
            apiUrl: "http://localhost",
            appLanguageIdsAsRef: ref([]),
        });
    });

    afterEach(async () => {
        for (const connection of connections) connection.close();
        for (const connection of connections) await connection.delete();
        connections = [];
    });

    it("keeps schema definitions, versions and sync cursors isolated across databases", async () => {
        const first = await open("named-isolation-first", "activityType");
        const second = await open("named-isolation-second", "differentIndex");
        const firstVersion = first.verno;
        const secondVersion = second.verno;
        const cursor = ref<SyncListEntry[]>([
            {
                chunkType: "userActivity",
                memberOf: ["*"],
                blockStart: 2000,
                blockEnd: 0,
                eof: true,
            },
        ]);
        await first.setSyncList(cursor);
        expect(await second.getSyncList(ref([]))).toBeUndefined();
        expect(first.tables.map((table) => table.name)).not.toContain("userActivity");
        expect(localStorage.getItem("dexie.dbIndex:named-isolation-first")).not.toBe(
            localStorage.getItem("dexie.dbIndex:named-isolation-second"),
        );
        first.close();
        second.close();

        const reopenedFirst = await open("named-isolation-first", "activityType");
        const reopenedSecond = await open("named-isolation-second", "differentIndex");
        expect(reopenedFirst.verno).toBe(firstVersion);
        expect(reopenedSecond.verno).toBe(secondVersion);
        const restored = ref<SyncListEntry[]>([]);
        await reopenedFirst.getSyncList(restored);
        expect(restored.value).toEqual(cursor.value);
        expect(await reopenedSecond.getSyncList(ref([]))).toBeUndefined();
    });

    it("surfaces a blocked source upgrade and resumes after the other connection closes", async () => {
        const name = "named-blocked-upgrade";
        const original = await open(name, "beforeUpgrade");
        original.close();
        const blocking = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open(name);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const opening = open(name, "afterUpgrade");
        try {
            await waitForExpect(() => expect(dbUpgradeBlocked.value).toBe(true));
        } finally {
            blocking.close();
            await opening;
        }
        expect(dbUpgradeBlocked.value).toBe(false);
    });

    it("does not restore source data from late acknowledgements after clear or a newer edit", async () => {
        const source = await open("named-late-ack", "");
        const doc = { _id: "liked:one", type: DocType.UserActivity, updatedTimeUtc: 100 };
        const { localChangeId } = await source.upsert({ doc, overwriteLocalChanges: true });
        const oldChange = (await source.localChanges.get(localChangeId)) as LocalChangeDto;
        await source.upsert({ doc: { ...doc, updatedTimeUtc: 300 }, overwriteLocalChanges: true });
        await source.applyLocalChangeAck(
            {
                ack: AckStatus.Rejected,
                docs: [{ ...doc, updatedTimeUtc: 200 }],
            },
            oldChange,
        );
        expect((await source.docs.get(doc._id))?.updatedTimeUtc).toBe(300);
        expect(await source.localChanges.count()).toBe(1);

        const queued = (await source.localChanges.toArray())[0] as LocalChangeDto;
        await source.clear();
        await source.applyLocalChangeAck({ ack: AckStatus.Rejected, docs: [doc] }, queued);
        expect(await source.docs.count()).toBe(0);
        expect(await source.localChanges.count()).toBe(0);
    });
});
