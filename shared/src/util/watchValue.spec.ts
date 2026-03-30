import { describe, it, expect, vi, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { watchValue } from "./watchValue";

describe("watchValue", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("calls the callback when the value changes", async () => {
        const callback = vi.fn();
        const source = ref({ name: "Alice" });
        const stop = watchValue(source, callback);

        source.value = { name: "Bob" };
        await nextTick();

        expect(callback).toHaveBeenCalledTimes(1);
        stop();
    });

    it("does not call the callback when reassigned the same value", async () => {
        const callback = vi.fn();
        const source = ref({ name: "Alice" });
        const stop = watchValue(source, callback);

        // First change initialises lastValue
        source.value = { name: "Bob" };
        await nextTick();
        expect(callback).toHaveBeenCalledTimes(1);

        // Same value again — isEqual check should suppress the callback
        source.value = { name: "Bob" };
        await nextTick();
        expect(callback).toHaveBeenCalledTimes(1);
        stop();
    });

    it("calls the callback immediately when immediate: true", async () => {
        const callback = vi.fn();
        const source = ref({ count: 1 });
        const stop = watchValue(source, callback, { immediate: true });

        await nextTick();
        expect(callback).toHaveBeenCalledTimes(1);
        stop();
    });

    it("does not fire again for the same initial value when immediate: true", async () => {
        const callback = vi.fn();
        const source = ref({ count: 1 });
        const stop = watchValue(source, callback, { immediate: true });

        await nextTick();
        expect(callback).toHaveBeenCalledTimes(1); // the immediate call

        // Structurally identical reassignment — must not fire
        source.value = { count: 1 };
        await nextTick();
        expect(callback).toHaveBeenCalledTimes(1);
        stop();
    });

    it("stops watching after the returned stop function is called", async () => {
        const callback = vi.fn();
        const source = ref(1);
        const stop = watchValue(source, callback);

        stop();
        source.value = 2;
        await nextTick();

        expect(callback).not.toHaveBeenCalled();
    });

    it("passes newValue and oldValue to the callback", async () => {
        const callback = vi.fn();
        const source = ref(10);
        const stop = watchValue(source, callback);

        source.value = 20;
        await nextTick();

        expect(callback).toHaveBeenCalledWith(20, 10);
        stop();
    });

    it("fires for each distinct change in a sequence", async () => {
        const callback = vi.fn();
        const source = ref(0);
        const stop = watchValue(source, callback);

        source.value = 1;
        await nextTick();
        source.value = 2;
        await nextTick();
        source.value = 3;
        await nextTick();

        expect(callback).toHaveBeenCalledTimes(3);
        stop();
    });

    it("suppresses duplicate value even after several different values", async () => {
        const callback = vi.fn();
        const source = ref("a");
        const stop = watchValue(source, callback);

        source.value = "b";
        await nextTick();
        source.value = "c";
        await nextTick();
        source.value = "c"; // duplicate — should not fire
        await nextTick();

        expect(callback).toHaveBeenCalledTimes(2);
        stop();
    });
});
