import { describe, expect, beforeEach, test, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import { ref, type Ref } from "vue";
import { useHasLocalChanges } from "./useHasLocalChange";
import { useDexieLiveQuery } from "../useDexieLiveQuery";

// The subscription is backed by a live query over the localChanges docId index; mock it so the
// docId set can be driven directly (live-query reactivity itself is covered by
// useDexieLiveQuery's own tests). The module memoizes ONE subscription, so the mock returns a
// single shared ref the tests mutate.
vi.mock("../useDexieLiveQuery", () => ({ useDexieLiveQuery: vi.fn() }));

const queueIds: Ref<string[]> = ref([]);

describe("useHasLocalChange", () => {
    beforeEach(() => {
        queueIds.value = [];
        vi.mocked(useDexieLiveQuery).mockReturnValue(queueIds as any);
    });

    test("useHasLocalChanges returns false when no change is queued for the id", () => {
        const has = useHasLocalChanges();
        expect(has.value("a")).toBe(false);
    });

    test("useHasLocalChanges is true only for docIds present in the queue", () => {
        queueIds.value = ["a"];
        const has = useHasLocalChanges();
        expect(has.value("a")).toBe(true);
        expect(has.value("b")).toBe(false);
    });

    test("useHasLocalChanges reacts to the queue changing", async () => {
        const has = useHasLocalChanges();
        expect(has.value("a")).toBe(false);

        // Simulate db.upsert queuing a change for "a", then the server ack clearing it.
        queueIds.value = ["a"];
        await waitForExpect(() => expect(has.value("a")).toBe(true));
        queueIds.value = [];
        await waitForExpect(() => expect(has.value("a")).toBe(false));
    });

    test("shares one subscription across many callers", () => {
        // Memoized singleton: many calls must not each open a live query.
        vi.mocked(useDexieLiveQuery).mockClear();
        useHasLocalChanges();
        useHasLocalChanges();
        useHasLocalChanges();
        expect(useDexieLiveQuery).not.toHaveBeenCalled();
    });
});
