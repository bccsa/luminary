import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { db, serverAffinity, DocType, type UserAffinityDto } from "luminary-shared";
import { affinityProfile, recordAffinity } from "./affinityStore";

const userAffinity = (ownerId: string): UserAffinityDto =>
    ({
        _id: `user-affinity-${ownerId}`,
        type: DocType.UserAffinity,
        ownerId,
        affinity: {},
    }) as UserAffinityDto;

// `vi.advanceTimersByTimeAsync` fires schedulePush's faked setTimeout, but the `db.upsert()`
// it kicks off is a real fake-indexeddb write that needs a genuine macrotask turn to settle —
// microtasks (bare `Promise.resolve()`/`queueMicrotask`) are not enough. `setTimeout` itself is
// faked in this scope, so use the unfaked `setImmediate` to get a real turn.
const flushWrites = () => new Promise((resolve) => setImmediate(resolve));

describe("affinityStore", () => {
    beforeEach(async () => {
        // Fake only setTimeout/clearTimeout (schedulePush's debounce) — leaving other timer
        // primitives real so fake-indexeddb's own internal async completion still runs.
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        localStorage.clear();
        affinityProfile.value = { affinity: {}, lastDecayUtc: undefined };
        serverAffinity.value = undefined;
        await nextTick();
        await db.localChanges.clear();
    });

    afterEach(async () => {
        vi.useRealTimers();
        await db.localChanges.clear();
        localStorage.clear();
    });

    it("records an interaction into the local profile and persists it", () => {
        recordAffinity(["tag-a"]);

        expect(affinityProfile.value.affinity["tag-a"]).toBeGreaterThan(0);
        expect(
            JSON.parse(localStorage.getItem("affinityProfile")!).affinity["tag-a"],
        ).toBeGreaterThan(0);
    });

    it("does nothing for an empty/undefined tag list", () => {
        recordAffinity(undefined);
        recordAffinity([]);

        expect(affinityProfile.value.affinity).toEqual({});
    });

    it("does not queue a server push for a guest (no serverAffinity)", async () => {
        recordAffinity(["tag-a"]);
        await vi.advanceTimersByTimeAsync(30_000);

        expect(await db.localChanges.count()).toBe(0);
    });

    it("queues a throttled push to /changerequest once logged in", async () => {
        serverAffinity.value = userAffinity("user-1");
        await nextTick();

        recordAffinity(["tag-a"]);
        await vi.advanceTimersByTimeAsync(30_000);
        await flushWrites();

        const change = await db.localChanges.where({ docId: "user-affinity-user-1" }).first();
        expect(change?.doc).toMatchObject({
            _id: "user-affinity-user-1",
            ownerId: "user-1",
            affinity: { "tag-a": expect.any(Number) },
        });
    });

    it("resets the push throttle on logout so a different user isn't delayed by it", async () => {
        serverAffinity.value = userAffinity("user-1");
        await nextTick();
        recordAffinity(["tag-a"]);
        await vi.advanceTimersByTimeAsync(30_000); // first push fires, stamps lastPush
        await flushWrites();

        serverAffinity.value = undefined; // logout
        await nextTick();

        serverAffinity.value = userAffinity("user-2"); // different user, same tab
        await nextTick();
        recordAffinity(["tag-b"]);
        // Without the reset, `due` would be ~30s (throttled by user-1's lastPush).
        // With the reset, it fires on the next tick.
        await vi.advanceTimersByTimeAsync(1);
        await flushWrites();

        const change = await db.localChanges.where({ docId: "user-affinity-user-2" }).first();
        expect(change?.doc).toMatchObject({ ownerId: "user-2" });
    });
});
