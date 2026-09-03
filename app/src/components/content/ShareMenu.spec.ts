import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { computed, nextTick, ref } from "vue";
import { setActivePinia, createPinia } from "pinia";
import type { ContentDto } from "luminary-shared";
import ShareMenu from "./ShareMenu.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";

// The image bucket resolves from a live query the component tree doesn't own here; set
// `bucket.url` before mounting to give the share an image to attach.
const { bucket } = vi.hoisted(() => ({ bucket: { url: undefined as string | undefined } }));

const { dataSaver } = vi.hoisted(() => ({ dataSaver: { on: false } }));
vi.mock("@/globalConfig", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/globalConfig")>()),
    isDataSaverEnabled: () => dataSaver.on,
}));
vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({ bucket: ref(null), bucketBaseUrl: computed(() => bucket.url) }),
}));

const TRIGGER = '[data-test="shareMenuTrigger"]';

const setNativeShare = (share: unknown) =>
    Object.defineProperty(navigator, "share", { configurable: true, value: share });

// The global test setup stubs matchMedia as always-false (a desktop, fine pointer).
const setCanShare = (canShare: boolean) =>
    Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: vi.fn().mockReturnValue(canShare),
    });

const stubImageFetch = () => {
    const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["image-bytes"], { type: "image/webp" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
};

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
        bucket.url = undefined;
        dataSaver.on = false;
    });

    afterEach(() => {
        // @ts-expect-error jsdom has no navigator.share to restore
        delete navigator.share;
        // @ts-expect-error jsdom has no navigator.canShare to restore
        delete navigator.canShare;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // The native-share branch is resolved in onMounted, so the first render is always
    // the fallback menu — settle it before asserting on the trigger.
    const mountMenu = async (props: { content?: ContentDto; copyright?: string } = {}) => {
        const wrapper = mount(ShareMenu, {
            props: { content: mockEnglishContentDto, ...props },
        });
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

    // Instagram accepts nothing but media, so it only appears in the OS sheet for a share
    // that carries a file.
    it("attaches the article image to the native share", async () => {
        bucket.url = "https://cdn.test/bucket";
        setNativeShare(vi.fn().mockResolvedValue(undefined));
        setCanShare(true);
        stubImageFetch();

        const wrapper = await mountMenu();
        await flushPromises();
        await wrapper.find(TRIGGER).trigger("click");

        const shared = vi.mocked(navigator.share).mock.calls[0][0]!;
        expect(shared.files?.map((f) => f.name)).toEqual(["test-image.webp"]);
        expect(shared.text).toContain(mockEnglishContentDto.title);
    });

    // The reader asked for less data; the link preview still carries the image.
    it("skips the image fetch in data-saver mode", async () => {
        dataSaver.on = true;
        bucket.url = "https://cdn.test/bucket";
        setNativeShare(vi.fn().mockResolvedValue(undefined));
        setCanShare(true);
        const fetchSpy = stubImageFetch();

        const wrapper = await mountMenu();
        await flushPromises();
        await wrapper.find(TRIGGER).trigger("click");

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(vi.mocked(navigator.share).mock.calls[0][0]!.files).toBeUndefined();
    });

    it("shares text alone when the platform won't take a file", async () => {
        bucket.url = "https://cdn.test/bucket";
        setNativeShare(vi.fn().mockResolvedValue(undefined));
        setCanShare(false);
        stubImageFetch();

        const wrapper = await mountMenu();
        await flushPromises();
        await wrapper.find(TRIGGER).trigger("click");

        expect(vi.mocked(navigator.share).mock.calls[0][0]!.files).toBeUndefined();
    });

    // Posts rarely carry a copyright of their own, so SingleContent resolves the notice
    // (the post's, else the instance-wide one) and passes it down.
    it("puts the copyright it is given in the share message", async () => {
        const wrapper = await mountMenu({ copyright: "© 2026 Luminary" });
        await wrapper.find(TRIGGER).trigger("click");
        await wrapper.find('[data-test="shareTelegram"]').trigger("click");

        const opened = new URL(vi.mocked(window.open).mock.calls[0][0] as string);
        expect(opened.searchParams.get("text")).toContain("© 2026 Luminary");
    });

    it("falls back to the post's own copyright when given none", async () => {
        const wrapper = await mountMenu({
            content: { ...mockEnglishContentDto, copyright: "© Post author" },
        });
        await wrapper.find(TRIGGER).trigger("click");
        await wrapper.find('[data-test="shareTelegram"]').trigger("click");

        const opened = new URL(vi.mocked(window.open).mock.calls[0][0] as string);
        expect(opened.searchParams.get("text")).toContain("© Post author");
    });
});
