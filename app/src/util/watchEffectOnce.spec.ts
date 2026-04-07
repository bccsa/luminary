import { describe, it, expect, vi } from "vitest";
import { ref, nextTick } from "vue";
import { watchEffectOnce, watchEffectOnceAsync } from "./watchEffectOnce";

describe("watchEffectOnce", () => {
    it("fires callback when watcher returns truthy", async () => {
        const flag = ref(false);
        const callback = vi.fn();

        watchEffectOnce(() => flag.value, callback);
        await nextTick();
        expect(callback).not.toHaveBeenCalled();

        flag.value = true;
        await nextTick();
        expect(callback).toHaveBeenCalledOnce();
    });

    it("does not fire callback when watcher stays falsy", async () => {
        const flag = ref(false);
        const callback = vi.fn();

        watchEffectOnce(() => flag.value, callback);
        await nextTick();
        await nextTick();

        expect(callback).not.toHaveBeenCalled();
    });

    it("stops watching after first truthy value", async () => {
        const flag = ref(false);
        const callback = vi.fn();

        watchEffectOnce(() => flag.value, callback);

        flag.value = true;
        await nextTick();
        expect(callback).toHaveBeenCalledOnce();

        flag.value = false;
        await nextTick();
        flag.value = true;
        await nextTick();

        expect(callback).toHaveBeenCalledOnce();
    });

    it("fires callback when watcher becomes truthy after initial falsy", async () => {
        const val = ref(0);
        const callback = vi.fn();

        watchEffectOnce(() => val.value > 0, callback);
        await nextTick();
        expect(callback).not.toHaveBeenCalled();

        val.value = 5;
        await nextTick();
        expect(callback).toHaveBeenCalledOnce();
    });
});

describe("watchEffectOnceAsync", () => {
    it("resolves when watcher returns truthy", async () => {
        const flag = ref(false);
        let resolved = false;

        const promise = watchEffectOnceAsync(() => flag.value).then(() => {
            resolved = true;
        });

        await nextTick();
        expect(resolved).toBe(false);

        flag.value = true;
        await nextTick();
        await promise;
        expect(resolved).toBe(true);
    });

    it("resolves when watcher transitions from falsy to truthy", async () => {
        const val = ref("");
        const promise = watchEffectOnceAsync(() => val.value);

        await nextTick();

        val.value = "loaded";
        await promise;
        // If we get here, the promise resolved
        expect(true).toBe(true);
    });
});
