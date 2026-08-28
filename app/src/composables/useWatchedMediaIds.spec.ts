import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineComponent, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useWatchedMediaIds } from "./useWatchedMediaIds";

const TestComponent = defineComponent({
    setup() {
        const mediaProgress = useWatchedMediaIds();
        return { mediaProgress };
    },
    template: "<div></div>",
});

describe("useWatchedMediaIds", () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        localStorage.clear();
    });

    it("reads initial mediaProgress value from localStorage", () => {
        const mockProgress = [
            { mediaId: "media-1", contentId: "content-1" }
        ];
        localStorage.setItem("mediaProgress", JSON.stringify(mockProgress));

        const wrapper = mount(TestComponent);
        expect(wrapper.vm.mediaProgress).toEqual(mockProgress);
    });

    it("updates reactively when storage event fires", async () => {
        const wrapper = mount(TestComponent);
        expect(wrapper.vm.mediaProgress).toEqual([]);

        const mockProgress = [
            { mediaId: "media-2", contentId: "content-2" }
        ];
        localStorage.setItem("mediaProgress", JSON.stringify(mockProgress));

        // Dispatch storage event
        window.dispatchEvent(new Event("storage"));
        await nextTick();

        expect(wrapper.vm.mediaProgress).toEqual(mockProgress);
    });

    it("updates periodically via interval", async () => {
        const wrapper = mount(TestComponent);
        expect(wrapper.vm.mediaProgress).toEqual([]);

        const mockProgress = [
            { mediaId: "media-3", contentId: "content-3" }
        ];
        localStorage.setItem("mediaProgress", JSON.stringify(mockProgress));

        // Fast forward 5 seconds
        vi.advanceTimersByTime(5000);
        await nextTick();

        expect(wrapper.vm.mediaProgress).toEqual(mockProgress);
    });

    it("cleans up event listeners and intervals on unmount", () => {
        const removeEventSpy = vi.spyOn(window, "removeEventListener");
        const clearIntervalSpy = vi.spyOn(window, "clearInterval");

        const wrapper = mount(TestComponent);
        wrapper.unmount();

        expect(removeEventSpy).toHaveBeenCalledWith("storage", expect.any(Function));
        expect(clearIntervalSpy).toHaveBeenCalled();
    });
});
