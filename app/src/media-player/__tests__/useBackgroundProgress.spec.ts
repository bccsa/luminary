import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import type { VideoBackgroundProgress } from "@/build-time/contracts/video-player/contract";
import { applyBackgroundProgress, useBackgroundProgress } from "../useBackgroundProgress";

const applyMock = vi.hoisted(() => vi.fn());
vi.mock("@/contentProgress", () => ({ applyBackgroundMediaProgress: applyMock }));
const completionMock = vi.hoisted(() => vi.fn());
vi.mock("../mediaCompletion", () => ({ recordMediaCompletion: completionMock }));
const getMock = vi.hoisted(() => vi.fn());
vi.mock("luminary-shared", async (original) => ({
    ...(await original<typeof import("luminary-shared")>()),
    db: { get: getMock },
}));

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
    completionMock.mockReset();
    getMock.mockReset();
    setVisibility("visible");
});

describe("useBackgroundProgress", () => {
    it("leaves the start to the app's boot, before it mounts", async () => {
        const take = vi.fn().mockResolvedValue(kept);
        mountWith({ takeBackgroundProgress: take });
        await flushPromises();

        expect(take).not.toHaveBeenCalled();
    });

    it("asks again on every return to the foreground, not on leaving", async () => {
        const take = vi.fn().mockResolvedValue(null);
        mountWith({ takeBackgroundProgress: take });
        await flushPromises();

        setVisibility("hidden");
        expect(take).not.toHaveBeenCalled();
        take.mockResolvedValueOnce(kept);
        setVisibility("visible");
        await flushPromises();

        expect(take).toHaveBeenCalledTimes(1);
        expect(applyMock).toHaveBeenCalledTimes(1);
        expect(applyMock).toHaveBeenCalledWith(kept);
    });

    it("stops listening once unmounted", async () => {
        const take = vi.fn().mockResolvedValue(null);
        const wrapper = mountWith({ takeBackgroundProgress: take });
        await flushPromises();
        wrapper.unmount();

        setVisibility("visible");
        expect(take).not.toHaveBeenCalled();
    });

    it("does nothing on a platform whose page saves on its own, or when the platform fails", async () => {
        mountWith({});
        const take = vi.fn().mockRejectedValue(new Error("not implemented"));
        mountWith({ takeBackgroundProgress: take });
        setVisibility("visible");
        await flushPromises();
        await applyBackgroundProgress(undefined);
        await applyBackgroundProgress(take);

        expect(applyMock).not.toHaveBeenCalled();
    });
});

describe("applyBackgroundProgress", () => {
    const content = { parentId: "post", parentTags: ["tag"] };

    it("applies what the platform kept", async () => {
        await applyBackgroundProgress(vi.fn().mockResolvedValue(kept));
        expect(applyMock).toHaveBeenCalledWith(kept);
    });

    it("scores a completion the background crossed, when asked", async () => {
        applyMock.mockReturnValue({ contentId: "c", from: 300, to: 600, duration: 600 });
        getMock.mockResolvedValue(content);

        await applyBackgroundProgress(vi.fn().mockResolvedValue(kept), { scoreCompletion: true });

        expect(getMock).toHaveBeenCalledWith("c");
        expect(completionMock).toHaveBeenCalledWith(content);
    });

    it("leaves scoring to a live page, one the page already passed, and one not reached", async () => {
        getMock.mockResolvedValue(content);
        const take = vi.fn().mockResolvedValue(kept);

        applyMock.mockReturnValue({ contentId: "c", from: 300, to: 600, duration: 600 });
        await applyBackgroundProgress(take);
        applyMock.mockReturnValue({ contentId: "c", from: 500, to: 600, duration: 600 });
        await applyBackgroundProgress(take, { scoreCompletion: true });
        applyMock.mockReturnValue({ contentId: "c", from: 100, to: 400, duration: 600 });
        await applyBackgroundProgress(take, { scoreCompletion: true });
        applyMock.mockReturnValue(undefined);
        await applyBackgroundProgress(take, { scoreCompletion: true });

        expect(completionMock).not.toHaveBeenCalled();
    });
});
