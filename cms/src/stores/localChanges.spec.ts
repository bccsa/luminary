import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { useLocalChangeStore } from "./localChanges";
import { setActivePinia, createPinia } from "pinia";
import { useSocketConnectionStore } from "./socketConnection";
import { db } from "@/db/baseDatabase";
import { mockContent, mockLocalChange1, mockLocalChange2, mockPost } from "@/tests/mockData";
import { AckStatus, LocalChangeStatus, type ChangeReqAckDto, type Post } from "@/types";
import { flushPromises } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";

const socketMock = vi.hoisted(() => ({
    emit: vi.fn(),
}));

vi.mock("@/socket", () => ({
    socket: socketMock,
}));

describe("localChanges store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        db.localChanges.bulkPut([mockLocalChange1, mockLocalChange2]);
        db.docs.bulkPut([mockPost, mockContent]);
    });

    afterEach(() => {
        vi.clearAllMocks();
        db.localChanges.clear();
        db.docs.clear();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("can watch for syncable changes", async () => {
        const localChangesStore = useLocalChangeStore();
        const socketConnectionStore = useSocketConnectionStore();
        socketConnectionStore.isConnected = false;

        localChangesStore.watchForSyncableChanges();

        // Check that nothing was synced
        let changes = await db.localChanges.toArray();
        expect(changes[0].status).toBe(LocalChangeStatus.Unsynced);
        expect(changes[1].status).toBe(LocalChangeStatus.Unsynced);

        // Start syncing when socket is connected
        socketConnectionStore.isConnected = true;
        await flushPromises();

        changes = await db.localChanges.toArray();
        expect(changes[0].status).toBe(LocalChangeStatus.Syncing);
        expect(changes[1].status).toBe(LocalChangeStatus.Syncing);
    });

    it("emits a change request when syncing", async () => {
        const localChangesStore = useLocalChangeStore();
        const socketConnectionStore = useSocketConnectionStore();
        socketConnectionStore.isConnected = true;

        localChangesStore.watchForSyncableChanges();

        await flushPromises();

        await waitForExpect(() => {
            expect(socketMock.emit).toHaveBeenCalledTimes(1);
            expect(socketMock.emit).toHaveBeenCalledWith("changeRequest", [
                { ...mockLocalChange1, status: LocalChangeStatus.Syncing },
                { ...mockLocalChange2, status: LocalChangeStatus.Syncing },
            ]);
        });
    });

    it("can handle an accepted ack from the API", async () => {
        const localChangesStore = useLocalChangeStore();
        const ack: ChangeReqAckDto = {
            id: mockLocalChange1.id,
            ack: AckStatus.Accepted,
        };

        localChangesStore.handleAck(ack);

        const change = await db.localChanges.where("id").equals(mockLocalChange1.id).first();

        expect(change).toBe(undefined);
    });

    it("can handle a rejected ack with a doc", async () => {
        const localChangesStore = useLocalChangeStore();
        const ack: ChangeReqAckDto = {
            id: mockLocalChange1.id,
            ack: AckStatus.Rejected,
            doc: {
                ...mockLocalChange1.doc,
                tags: ["updated-tag"],
            } as unknown as Post,
        };

        localChangesStore.handleAck(ack);

        await waitForExpect(async () => {
            const doc = (await db.docs
                .where("_id")
                .equals(ack.doc!._id)
                .first()) as unknown as Post;
            expect(doc!.tags).toEqual(["updated-tag"]);

            const change = await db.localChanges.where("id").equals(mockLocalChange1.id).first();
            expect(change).toBe(undefined);
        });
    });

    it("can handle a rejected ack without a doc", async () => {
        const localChangesStore = useLocalChangeStore();
        const ack: ChangeReqAckDto = {
            id: mockLocalChange1.id,
            ack: AckStatus.Rejected,
        };

        localChangesStore.handleAck(ack);

        await waitForExpect(async () => {
            const doc = await db.docs.where("_id").equals(mockPost._id).first();
            expect(doc).toBe(undefined);

            const change = await db.localChanges.where("id").equals(mockLocalChange1.id).first();
            expect(change).toBe(undefined);
        });
    });
});
