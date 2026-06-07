import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import {
    subscribeRooms,
    setBaseRooms,
    initRoomSubscriptions,
    _roomSubscriptionsState,
} from "./roomSubscriptions";
import { getSocket, isConnected } from "./socketio";
import { initConfig } from "../config";
import { DocType } from "../types";

let emitSpy: ReturnType<typeof vi.spyOn>;

const joinCalls = () =>
    emitSpy.mock.calls.filter((c) => c[0] === "joinRooms").map((c) => (c[1] as any).docTypes);
const leaveCalls = () =>
    emitSpy.mock.calls.filter((c) => c[0] === "leaveRooms").map((c) => (c[1] as any).docTypes);

describe("roomSubscriptions", () => {
    beforeAll(() => {
        initConfig({ cms: false, docsIndex: "", apiUrl: "http://localhost:1" });
        emitSpy = vi.spyOn(getSocket(), "emit").mockImplementation(() => undefined as any);
        initRoomSubscriptions();
    });

    afterEach(() => {
        setBaseRooms([]); // release sync2's token
        emitSpy.mockClear();
    });

    it("joins on the first subscriber and leaves only on the last", () => {
        const a = subscribeRooms([DocType.User]);
        expect(joinCalls()).toEqual([[DocType.User]]);

        // Second subscriber on the same docType — no extra join.
        const b = subscribeRooms([DocType.User]);
        expect(joinCalls()).toEqual([[DocType.User]]);

        // Releasing one subscriber must NOT leave the room — the other still holds it.
        a();
        expect(leaveCalls()).toEqual([]);

        // Releasing the last subscriber leaves the room exactly once.
        b();
        expect(leaveCalls()).toEqual([[DocType.User]]);
    });

    it("disposer is idempotent (double-dispose is a no-op)", () => {
        const a = subscribeRooms([DocType.User]);
        const b = subscribeRooms([DocType.User]);
        a();
        a(); // second call must not release b's hold
        expect(leaveCalls()).toEqual([]);
        expect(_roomSubscriptionsState().get(DocType.User)?.size).toBe(1);
        b();
        expect(leaveCalls()).toEqual([[DocType.User]]);
    });

    it("setBaseRooms diffs: joins additions, leaves removals, leaves nothing held elsewhere", () => {
        const held = subscribeRooms([DocType.Post]); // HybridQuery also wants Post
        emitSpy.mockClear();

        setBaseRooms([DocType.Post, DocType.Tag]);
        // Post already held by `held` → no join; Tag is new → join.
        expect(joinCalls()).toEqual([[DocType.Tag]]);

        setBaseRooms([DocType.Tag]);
        // Post removed from base but still held by `held` → not left; Tag stays.
        expect(leaveCalls()).toEqual([]);

        held(); // last holder of Post releases → Post is left
        expect(leaveCalls()).toEqual([[DocType.Post]]);
    });

    it("re-joins every still-wanted room on reconnect", async () => {
        // Establish a disconnected baseline the watcher has observed.
        isConnected.value = false;
        await nextTick();

        const sub = subscribeRooms([DocType.User]);
        setBaseRooms([DocType.Post]);
        emitSpy.mockClear(); // drop the initial joins emitted on subscribe

        isConnected.value = true; // reconnect (false → true)
        await nextTick();

        const rejoined = joinCalls().flat().sort();
        expect(rejoined).toEqual([DocType.Post, DocType.User].sort());

        sub();
        isConnected.value = false;
        await nextTick();
    });
});
