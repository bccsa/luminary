import { describe, it, expect, beforeEach } from "vitest";
import { nextTick } from "vue";
import {
    markAppError,
    markAppReady,
    markPageError,
    markPageLoading,
    markPageReady,
    type SsgState,
} from "./ssgRenderState";

describe("ssgRenderState", () => {
    beforeEach(async () => {
        markAppReady();
        markPageLoading();
        await nextTick();
    });

    it("reflects loading state on document.documentElement", async () => {
        markPageLoading();
        await nextTick();
        expect(document.documentElement.dataset.ssgState).toBe("loading");
    });

    it("flips to ready when page is ready", async () => {
        markPageReady();
        await nextTick();
        expect(document.documentElement.dataset.ssgState).toBe("ready");
    });

    it("flips back to loading on markPageLoading", async () => {
        markPageReady();
        await nextTick();
        markPageLoading();
        await nextTick();
        expect(document.documentElement.dataset.ssgState).toBe("loading");
    });

    it("flips to error on markPageError", async () => {
        markPageError();
        await nextTick();
        expect(document.documentElement.dataset.ssgState).toBe("error");
    });

    it("flips to error on markAppError even if page is ready", async () => {
        markPageReady();
        await nextTick();
        markAppError();
        await nextTick();
        expect(document.documentElement.dataset.ssgState).toBe("error");
    });

    it("dispatches ssg-state-change event with new state", async () => {
        const events: SsgState[] = [];
        const handler = (e: Event) => events.push((e as CustomEvent<SsgState>).detail);
        window.addEventListener("ssg-state-change", handler);

        markPageReady();
        await nextTick();

        expect(events).toContain("ready");
        window.removeEventListener("ssg-state-change", handler);
    });
});
