import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from "vitest";
import { useSocketConnectionStore } from "./socketConnection";
import { setActivePinia, createPinia } from "pinia";
import { mockEnglishContentDto, mockPostDto } from "@/tests/mockData";
import { type ChangeReqAckDto, AckStatus } from "@/types";
import { useLocalChangeStore } from "./localChanges";
import { flushPromises } from "@vue/test-utils";

const lastUpdatedTime = 42;
localStorage.setItem("syncVersion", lastUpdatedTime.toString());

const socketMocks = vi.hoisted(() => ({
    emit: vi.fn(),
    on: vi.fn(),
}));

vi.mock("@/socket", () => ({
    getSocket: () => socketMocks,
}));

// Invoke the callback for socket.on() only for the passed even
function listenToSocketOnEvent(allowedEvent: string | string[], returnValue?: any) {
    if (typeof allowedEvent == "string") {
        allowedEvent = [allowedEvent];
    }
    socketMocks.on = vi.fn().mockImplementation((socketEvent, callback) => {
        if (allowedEvent.includes(socketEvent)) {
            callback(returnValue);
        }
    });
}

const docsDb = vi.hoisted(() => {
    return {
        bulkPut: vi.fn(),
        orderBy: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        last: vi.fn().mockImplementation(() => {
            return new Promise((resolve) => {
                resolve({
                    updatedTimeUtc: lastUpdatedTime,
                });
            });
        }),
    };
});

vi.mock("@/db/baseDatabase", () => {
    return {
        db: {
            docs: docsDb,
            localChanges: docsDb,
        },
    };
});

describe("socketConnection", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("connects to the socket and sets the connected status", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("connect");

        store.bindEvents();

        expect(socketMocks.on).toHaveBeenCalledWith("connect", expect.any(Function));
        expect(store.isConnected).toEqual(true);
    });

    it("emits a clientDataReq after connecting", async () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("connect");

        store.bindEvents();

        await flushPromises();

        expect(socketMocks.emit).toHaveBeenCalledOnce();
        expect(socketMocks.emit).toHaveBeenCalledWith("clientDataReq", {
            version: lastUpdatedTime,
            cms: true,
        });
    });

    it("sets the state after disconnecting", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("disconnect");

        store.bindEvents();

        expect(store.isConnected).toEqual(false);
    });

    it("saves data from the API", () => {
        const store = useSocketConnectionStore();

        listenToSocketOnEvent("data", { docs: [mockPostDto, mockEnglishContentDto] });

        store.bindEvents();

        expect(docsDb.bulkPut).toHaveBeenCalledWith([mockPostDto, mockEnglishContentDto]);
    });

    it("handles acks for changes", () => {
        const store = useSocketConnectionStore();
        const localChangeStore = useLocalChangeStore();
        const handleAckSpy = vi.spyOn(localChangeStore, "handleAck");

        const ack: ChangeReqAckDto = {
            id: 42,
            ack: AckStatus.Accepted,
        };

        listenToSocketOnEvent("changeRequestAck", ack);

        store.bindEvents();

        expect(handleAckSpy).toHaveBeenCalledWith(ack);
    });
});
