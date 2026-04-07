import { describe, expect, it, vi } from "vitest";
import { ref, nextTick } from "vue";
import { watchEffectOnce, watchEffectOnceAsync } from "./watchEffectOnce";

describe("watchEffectOnce", () => {
    it("does not call fn when watcher returns falsy", async () => {
        const fn = vi.fn();
        const value = ref(false);

        watchEffectOnce(() => value.value, fn);
        await nextTick();

        expect(fn).not.toHaveBeenCalled();
    });

    it("calls fn when watcher transitions from falsy to truthy", async () => {
        const fn = vi.fn();
        const value = ref(false);

        watchEffectOnce(() => value.value, fn);
        await nextTick();
        expect(fn).not.toHaveBeenCalled();

        value.value = true;
        await nextTick();
        expect(fn).toHaveBeenCalledOnce();
    });

    it("stops watching after fn is called", async () => {
        const fn = vi.fn();
        const value = ref(false);

        watchEffectOnce(() => value.value, fn);
        await nextTick();

        value.value = true;
        await nextTick();
        expect(fn).toHaveBeenCalledOnce();

        // Should not call again after further changes
        value.value = false;
        await nextTick();
        value.value = true;
        await nextTick();
        expect(fn).toHaveBeenCalledOnce();
    });
});

describe("watchEffectOnceAsync", () => {
    it("resolves when watcher transitions from falsy to truthy", async () => {
        const value = ref(false);
        let resolved = false;

        const promise = watchEffectOnceAsync(() => value.value).then(() => {
            resolved = true;
        });

        await nextTick();
        expect(resolved).toBe(false);

        value.value = true;
        await promise;
        expect(resolved).toBe(true);
    });
});
