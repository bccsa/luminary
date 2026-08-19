import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import VideoPreview from "./VideoPreview.vue";

const getMediaKeyMock = vi.hoisted(() => vi.fn());
const getBucketByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@luminary-media-converter/player-web-legacy", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        LuminaryPlayer: defineComponent({
            name: "LuminaryPlayer",
            props: { source: { type: Object, required: true }, controls: { type: Object, default: undefined } },
            setup: () => () => h("div", { class: "player-stub" }),
        }),
    };
});

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    getRest: () => ({ getMediaKey: getMediaKeyMock }),
}));

vi.mock("@/composables/storageSelection", () => ({
    storageSelection: () => ({ getBucketById: getBucketByIdMock }),
}));

const parent = (media: Record<string, unknown> | undefined) =>
    ({ _id: "post-1", mediaBucketId: "bucket-1", media }) as any;

const player = (wrapper: any) => wrapper.findComponent({ name: "LuminaryPlayer" });

async function mountAndOpen(media: Record<string, unknown> | undefined) {
    const wrapper = mount(VideoPreview, { props: { parent: parent(media) } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.find('[data-test="video-preview-load"]').trigger("click");
    return wrapper;
}

beforeEach(() => {
    vi.clearAllMocks();
    getBucketByIdMock.mockReturnValue({ publicUrl: "https://cdn.example.com/media" });
    getMediaKeyMock.mockResolvedValue(undefined);
});

describe("VideoPreview", () => {
    it("offers nothing when the document has no video", () => {
        const wrapper = mount(VideoPreview, { props: { parent: parent(undefined) } });

        expect(wrapper.find('[data-test="video-preview"]').exists()).toBe(false);
    });

    it("does not fetch anything until asked", async () => {
        // An editor opens many documents and previews few; a preview that plays
        // itself is a surprise in a form.
        const wrapper = mount(VideoPreview, {
            props: { parent: parent({ hlsUrl: "/abc/master.m3u8" }) },
        });

        expect(player(wrapper).exists()).toBe(false);
        expect(wrapper.find('[data-test="video-preview-load"]').exists()).toBe(true);
    });

    it("resolves a bucket-relative URL through the bucket's public URL", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8" });

        expect(player(wrapper).props("source").masterUrl).toBe(
            "https://cdn.example.com/media/abc/master.m3u8",
        );
    });

    it("leaves media hosted elsewhere alone", async () => {
        // An external collection has no bucket to be relative to.
        const wrapper = await mountAndOpen({ hlsUrl: "https://other.example.com/x/master.m3u8" });

        expect(player(wrapper).props("source").masterUrl).toBe(
            "https://other.example.com/x/master.m3u8",
        );
    });

    it("uses a key the editor has just typed, before it is ever saved", async () => {
        // Checking a key before committing it is the point of previewing.
        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8", hlsKey: "a".repeat(32) });

        expect(player(wrapper).props("source").keyHex).toBe("a".repeat(32));
        expect(getMediaKeyMock).not.toHaveBeenCalled();
    });

    it("fetches a saved key, which the document cannot show again", async () => {
        getMediaKeyMock.mockResolvedValue({ keyHex: "b".repeat(32) });

        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8", hlsKey_id: "crypto-1" });

        expect(getMediaKeyMock).toHaveBeenCalledWith("post-1");
        expect(player(wrapper).props("source").keyHex).toBe("b".repeat(32));
    });

    it("prefers the typed key over the saved one", async () => {
        // The editor is replacing it; previewing the old one would check the
        // wrong thing.
        getMediaKeyMock.mockResolvedValue({ keyHex: "b".repeat(32) });

        const wrapper = await mountAndOpen({
            hlsUrl: "/abc/master.m3u8",
            hlsKey: "a".repeat(32),
            hlsKey_id: "crypto-1",
        });

        expect(player(wrapper).props("source").keyHex).toBe("a".repeat(32));
    });

    it("keeps the subtitles menu out, as the app does", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8" });

        expect(player(wrapper).props("controls")).toEqual({ subtitlesMenu: false });
    });

    it("closes again when the collection changes", async () => {
        // A different collection is a different thing to check.
        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8" });
        expect(player(wrapper).exists()).toBe(true);

        await wrapper.setProps({ parent: parent({ hlsUrl: "/def/master.m3u8" }) });

        expect(player(wrapper).exists()).toBe(false);
    });
});
