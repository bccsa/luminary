import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import { setActivePinia, createPinia } from "pinia";
import ShareMenu from "./ShareMenu.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";

const TRIGGER = '[data-test="shareMenuTrigger"]';

const setNativeShare = (share: unknown) =>
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

// The global test setup stubs matchMedia as always-false (a desktop, fine pointer).
const setCoarsePointer = (coarse: boolean) =>
    vi
        .spyOn(window, "matchMedia")
        .mockImplementation(
            (query) => ({ matches: coarse && query === "(pointer: coarse)" }) as MediaQueryList,
        );

describe("ShareMenu", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.spyOn(window, "open").mockImplementation(() => null);
        setCoarsePointer(true);
    });

    afterEach(() => {
        // @ts-expect-error jsdom has no navigator.share to restore
        delete navigator.share;
        vi.restoreAllMocks();
    });

    // The native-share branch is resolved in onMounted, so the first render is always
    // the fallback menu — settle it before asserting on the trigger.
    const mountMenu = async () => {
        const wrapper = mount(ShareMenu, { props: { content: mockEnglishContentDto } });
        await nextTick();
        return wrapper;
    };

    it("shares via the native share sheet on a touch device", async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        setNativeShare(share);

        const wrapper = await mountMenu();
        await wrapper.find(TRIGGER).trigger("click");

        expect(share).toHaveBeenCalledTimes(1);
        expect(share.mock.calls[0][0]).toMatchObject({
            title: mockEnglishContentDto.title,
            url: window.location.href,
        });
        expect(share.mock.calls[0][0].text).toContain(mockEnglishContentDto.title);
        expect(wrapper.find('[data-test="shareTelegram"]').exists()).toBe(false);
    });

    it("stays quiet when the reader dismisses the native sheet", async () => {
        setNativeShare(vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));

        const wrapper = await mountMenu();
        await wrapper.find(TRIGGER).trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="shareTelegram"]').exists()).toBe(false);
    });

    it("falls back to the curated targets when the native share is blocked", async () => {
        setNativeShare(vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError")));

        const wrapper = await mountMenu();
        await wrapper.find(TRIGGER).trigger("click");
        await flushPromises();

        expect(wrapper.find('[data-test="shareTelegram"]').isVisible()).toBe(true);
    });

    it("keeps the curated targets on desktop even when native share exists", async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        setNativeShare(share);
        setCoarsePointer(false);

        const wrapper = await mountMenu();
        await wrapper.find(TRIGGER).trigger("click");

        expect(share).not.toHaveBeenCalled();
        expect(wrapper.find('[data-test="shareTelegram"]').isVisible()).toBe(true);
    });

    it("opens the curated targets when the browser has no native share", async () => {
        const wrapper = await mountMenu();
        await wrapper.find(TRIGGER).trigger("click");

        expect(wrapper.find('[data-test="shareTelegram"]').isVisible()).toBe(true);

        await wrapper.find('[data-test="shareTelegram"]').trigger("click");
        expect(window.open).toHaveBeenCalledWith(
            expect.stringContaining("t.me/share/url"),
            "_blank",
        );
    });

    // t.me/share/url bounces to Telegram's home page on an empty `url`, so the article
    // link has to ride in that param rather than only inside `text`.
    it("gives Telegram the article link as its own share target", async () => {
        const wrapper = await mountMenu();
        await wrapper.find(TRIGGER).trigger("click");
        await wrapper.find('[data-test="shareTelegram"]').trigger("click");

        const opened = new URL(vi.mocked(window.open).mock.calls[0][0] as string);
        expect(opened.searchParams.get("url")).toBe(window.location.href);
        expect(opened.searchParams.get("text")).toContain(mockEnglishContentDto.title);
    });
});
