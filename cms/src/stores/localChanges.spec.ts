import "fake-indexeddb/auto";
import { describe, it, beforeEach, afterEach, vi, afterAll, expect } from "vitest";
import { useLocalChangeStore } from "./localChanges";
import { setActivePinia, createPinia } from "pinia";
import { useSocketConnectionStore } from "./socketConnection";
import { db } from "@/db/baseDatabase";
import {
    mockEnglishContentDto,
    mockLocalChange1,
    mockLocalChange2,
    mockPostDto,
} from "@/tests/mockData";
import { AckStatus, type ChangeReqAckDto, type Post } from "@/types";
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
        db.docs.bulkPut([mockPostDto, mockEnglishContentDto]);
    });

    afterEach(() => {
        vi.clearAllMocks();
        db.localChanges.clear();
        db.docs.clear();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("can check if a post has unsynced local changes", async () => {
        const localChangesStore = useLocalChangeStore();
        localChangesStore.localChanges = [mockLocalChange1, mockLocalChange2];

        const res = localChangesStore.isLocalChange(mockPostDto._id);
        expect(res).toBe(true);
    });

    it("will immediately sync when online", async () => {
        const localChangesStore = useLocalChangeStore();
        const socketConnectionStore = useSocketConnectionStore();
        localChangesStore.localChanges = [];
        socketConnectionStore.isConnected = true;

        localChangesStore.watchForSyncableChanges();
        localChangesStore.localChanges = [mockLocalChange1];

        await flushPromises();

        expect(socketMock.emit).toHaveBeenCalledTimes(1);
        expect(socketMock.emit).toHaveBeenCalledWith("changeRequest", mockLocalChange1);
    });

    it("will start syncing when coming online", async () => {
        const localChangesStore = useLocalChangeStore();
        const socketConnectionStore = useSocketConnectionStore();
        localChangesStore.localChanges = [mockLocalChange1, mockLocalChange2];

        socketConnectionStore.isConnected = false;

        localChangesStore.watchForSyncableChanges();

        // Check that nothing was synced
        expect(socketMock.emit).not.toHaveBeenCalled();

        // Start syncing when socket is connected
        socketConnectionStore.isConnected = true;
        await flushPromises();

        // Check that only one has been synced
        expect(socketMock.emit).toHaveBeenCalledTimes(1);
        expect(socketMock.emit).toHaveBeenCalledWith("changeRequest", mockLocalChange1);
    });

    it("will not sync via the watcher if there are multiple changes when online", async () => {
        const localChangesStore = useLocalChangeStore();
        const socketConnectionStore = useSocketConnectionStore();
        localChangesStore.localChanges = [];
        socketConnectionStore.isConnected = true;

        localChangesStore.watchForSyncableChanges();
        localChangesStore.localChanges = [mockLocalChange1, mockLocalChange2];

        await flushPromises();

        expect(socketMock.emit).not.toHaveBeenCalled();
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
            const doc = await db.docs.where("_id").equals(mockPostDto._id).first();
            expect(doc).toBe(undefined);

            const change = await db.localChanges.where("id").equals(mockLocalChange1.id).first();
            expect(change).toBe(undefined);
        });
    });
});
