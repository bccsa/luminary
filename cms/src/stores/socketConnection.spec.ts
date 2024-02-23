import { describe, it, expect, beforeEach, afterEach, vi, afterAll } from "vitest";
import { useSocketConnectionStore } from "./socketConnection";
import { setActivePinia, createPinia } from "pinia";
import { io } from "socket.io-client";
import { mockEnglishContentDto, mockPostDto } from "@/tests/mockData";
import { type ChangeReqAckDto, AckStatus } from "@/types";
import { useLocalChangeStore } from "./localChanges";

const socketMocks = vi.hoisted(() => {
    return {
        on: vi.fn(),
        emit: vi.fn(),
    };
});

vi.mock("socket.io-client", () => {
    return {
        io: vi.fn().mockImplementation(() => socketMocks),
    };
});

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
        where: vi.fn().mockReturnThis(),
        equals: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
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

        expect(io).toHaveBeenCalledOnce();
        expect(socketMocks.on).toHaveBeenCalledWith("connect", expect.any(Function));
        expect(store.isConnected).toEqual(true);
    });

    it("emits a clientDataReq after connecting", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("connect");

        store.bindEvents();

        expect(socketMocks.emit).toHaveBeenCalledOnce();
        expect(socketMocks.emit).toHaveBeenCalledWith("clientDataReq", { version: 0, cms: true });
    });

    it("sets the state after disconnecting", () => {
        const store = useSocketConnectionStore();
        listenToSocketOnEvent("disconnect");

        store.bindEvents();

        expect(store.isConnected).toEqual(false);
    });

    it("saves data from the API", () => {
        const store = useSocketConnectionStore();

        listenToSocketOnEvent("data", [mockPostDto, mockEnglishContentDto]);

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
