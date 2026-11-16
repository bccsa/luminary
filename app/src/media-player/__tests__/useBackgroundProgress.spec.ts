import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import type { VideoBackgroundProgress } from "@/build-time/contracts/video-player/contract";
import { useBackgroundProgress } from "../useBackgroundProgress";

const applyMock = vi.hoisted(() => vi.fn());
vi.mock("@/contentProgress", () => ({ applyBackgroundMediaProgress: applyMock }));

const Host = defineComponent({
    setup() {
        useBackgroundProgress();
        return () => h("div");
    },
});

const kept: VideoBackgroundProgress = { key: "k", position: 289, duration: 600, savedAt: 1 };

function mountWith(service: Record<string, unknown>) {
    return mount(Host, {
        global: { provide: { [VideoPlayerKey as symbol]: { component: "div", ...service } } },
    });
}

function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
    applyMock.mockReset();
    setVisibility("visible");
});

describe("useBackgroundProgress", () => {
    it("applies what the platform kept when the app starts", async () => {
        const take = vi.fn().mockResolvedValue(kept);
        mountWith({ takeBackgroundProgress: take });
        await flushPromises();

        expect(take).toHaveBeenCalledTimes(1);
        expect(applyMock).toHaveBeenCalledWith(kept);
    });

    it("asks again on every return to the foreground, not on leaving", async () => {
        const take = vi.fn().mockResolvedValue(null);
        mountWith({ takeBackgroundProgress: take });
        await flushPromises();

        setVisibility("hidden");
        expect(take).toHaveBeenCalledTimes(1);
        take.mockResolvedValueOnce(kept);
        setVisibility("visible");
        await flushPromises();

        expect(take).toHaveBeenCalledTimes(2);
        expect(applyMock).toHaveBeenCalledTimes(1);
        expect(applyMock).toHaveBeenCalledWith(kept);
    });

    it("stops listening once unmounted", async () => {
        const take = vi.fn().mockResolvedValue(null);
        const wrapper = mountWith({ takeBackgroundProgress: take });
        await flushPromises();
        wrapper.unmount();

        setVisibility("visible");
        expect(take).toHaveBeenCalledTimes(1);
    });

    it("does nothing on a platform whose page saves on its own, or when the platform fails", async () => {
        mountWith({});
        const take = vi.fn().mockRejectedValue(new Error("not implemented"));
        mountWith({ takeBackgroundProgress: take });
        await flushPromises();

        expect(applyMock).not.toHaveBeenCalled();
    });
});
