import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import waitForExpect from "wait-for-expect";
import VideoPreview from "./VideoPreview.vue";

const getSidecarMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());
// Which panel the stubbed player is showing, so a test can put it in the state
// the real player reaches on a missing playlist or a bad key.
const panelState = vi.hoisted(() => ({
    panel: undefined as string | undefined,
    error: undefined as any,
}));
const getBucketByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@luminary-media-converter/player-web-legacy", async () => {
    const { defineComponent, h } = await import("vue");
    return {
        LuminaryPlayer: defineComponent({
            name: "LuminaryPlayer",
            props: {
                source: { type: Object, required: true },
                controls: { type: Object, default: undefined },
            },
            // Renders whichever panel the test asks for, the way the real player
            // renders its own when the lifecycle reaches that state.
            setup:
                (_props: any, { slots }: any) =>
                () =>
                    h("div", { class: "player-stub" }, [
                        panelState.panel == "coming-soon" ? slots["coming-soon"]?.() : undefined,
                        panelState.panel == "error"
                            ? slots.error?.({ error: panelState.error, retry: retryMock })
                            : undefined,
                    ]),
        }),
    };
});

vi.mock("luminary-shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("luminary-shared")>()),
    getRest: () => ({ getSidecar: getSidecarMock }),
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
    getSidecarMock.mockResolvedValue(undefined);
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

    describe("a YouTube link", () => {
        const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

        it("is handed to the player untouched", async () => {
            // The player recognises it and switches to its YouTube mode; nothing
            // here has to know that, so long as the URL is not rewritten. Media
            // hosted elsewhere has no bucket to be relative to.
            const wrapper = await mountAndOpen({ hlsUrl: YT });

            expect(player(wrapper).props("source").masterUrl).toBe(YT);
        });

        it("is offered a preview like any other source", async () => {
            const wrapper = mount(VideoPreview, { props: { parent: parent({ hlsUrl: YT }) } });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(wrapper.find('[data-test="video-preview-load"]').exists()).toBe(true);
        });

        it("is not resolved against the bucket even when one is configured", async () => {
            // Prefixing the bucket would produce a URL that fetches nothing.
            getBucketByIdMock.mockReturnValue({ publicUrl: "https://cdn.example.com/media" });

            const wrapper = await mountAndOpen({ hlsUrl: YT });

            expect(player(wrapper).props("source").masterUrl).not.toContain("cdn.example.com");
        });

        it("asks for no key", async () => {
            // A YouTube video has nothing to decrypt.
            await mountAndOpen({ hlsUrl: YT });

            expect(getSidecarMock).not.toHaveBeenCalled();
        });
    });

    // Real (seed, masked) → key vector shared with api/src/util/maskKey.spec.ts,
    // cms/src/util/mediaEncoder.spec.ts and shared/src/util/unmaskKeyHex.spec.ts —
    // exercises the real unmaskKeyHex rather than a mock of it.
    const SIDECAR_ID = "sidecar-post-abc-hlsEncryptionKey";
    const MASKED_KEY_HEX = "98ceb55553113bf2fdd5a74b3fa6e8d8";
    const KEY_HEX = "000102030405060708090a0b0c0d0e0f";

    it("uses a key the editor has just typed, before it is ever saved", async () => {
        // Checking a key before committing it is the point of previewing.
        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8", hlsKey: "a".repeat(32) });

        expect(player(wrapper).props("source").keyHex).toBe("a".repeat(32));
        expect(getSidecarMock).not.toHaveBeenCalled();
    });

    it("fetches a saved key, which the document cannot show again", async () => {
        getSidecarMock.mockResolvedValue({
            sidecarId: SIDECAR_ID,
            parentId: "post-1",
            sidecarType: "hlsEncryptionKey",
            data: { maskedKeyHex: MASKED_KEY_HEX },
        });

        const wrapper = await mountAndOpen({ hlsUrl: "/abc/master.m3u8", hlsKey_id: "sidecar-1" });

        expect(getSidecarMock).toHaveBeenCalledWith("post-1", "hlsEncryptionKey", { cms: true });
        // Two awaits deep, not one: the sidecar fetch, then unmaskKeyHex's
        // crypto.subtle.digest. A single tick wins that race locally and loses it
        // on a slower runner.
        await waitForExpect(() => expect(player(wrapper).props("source").keyHex).toBe(KEY_HEX));
    });

    it("prefers the typed key over the saved one", async () => {
        // The editor is replacing it; previewing the old one would check the
        // wrong thing.
        getSidecarMock.mockResolvedValue({
            sidecarId: SIDECAR_ID,
            parentId: "post-1",
            sidecarType: "hlsEncryptionKey",
            data: { maskedKeyHex: MASKED_KEY_HEX },
        });

        const wrapper = await mountAndOpen({
            hlsUrl: "/abc/master.m3u8",
            hlsKey: "a".repeat(32),
            hlsKey_id: "sidecar-1",
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

/**
 * The preview opens in a dialog: the edit column is too narrow to judge a picture
 * in, and closing has to actually stop the player rather than leave it mounted for
 * the rest of the editing session.
 */
describe("VideoPreview in a dialog", () => {
    it("plays inside the dialog once opened", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "a1b2c3/master.m3u8" });

        expect(player(wrapper).exists()).toBe(true);
    });

    it("tears the player down on close, so closing stops it", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "a1b2c3/master.m3u8" });
        expect(player(wrapper).exists()).toBe(true);

        await wrapper.find('[data-test="modal-close"]').trigger("click");

        expect(player(wrapper).exists()).toBe(false);
    });

    it("survives a click beside the video, which should not throw the preview away", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "a1b2c3/master.m3u8" });

        await wrapper.find('[data-test="modal-backdrop"]').trigger("mousedown");

        expect(player(wrapper).exists()).toBe(true);
    });

    it("still closes on Escape, so nothing is trapped", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "a1b2c3/master.m3u8" });

        await wrapper.find('[data-test="modal-content"]').trigger("keydown.esc");

        expect(player(wrapper).exists()).toBe(false);
    });

    it("closes from one control, not two that do the same thing", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "a1b2c3/master.m3u8" });

        expect(wrapper.findAll('[data-test="modal-close"]')).toHaveLength(1);
        expect(wrapper.find('[data-test="modal-primary-button"]').exists()).toBe(false);
    });

    it("closes when the document is pointed at a different collection", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "a1b2c3/master.m3u8" });

        await wrapper.setProps({ parent: parent({ hlsUrl: "d4e5f6/master.m3u8" }) });

        expect(player(wrapper).exists()).toBe(false);
    });
});

/**
 * Whether the collection is encrypted decides how it can fail, so it is read
 * before pressing play rather than found underneath afterwards.
 */
describe("the encryption marker", () => {
    it("marks an encrypted collection, in the header beside the close control", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/a1b2c3/master.m3u8", hlsKey: "beef" });

        expect(wrapper.find('[data-test="preview-encryption"]').text()).toContain("Encrypted");
    });

    it("says plainly when nothing is encrypted", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/a1b2c3/master.m3u8" });

        expect(wrapper.find('[data-test="preview-encryption"]').text()).toContain("Not encrypted");
    });

    it("keeps which key is playing available without spending a line on it", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/a1b2c3/master.m3u8", hlsKey: "beef" });

        expect(wrapper.find('[data-test="preview-encryption"]').attributes("title")).toContain(
            "not yet saved",
        );
    });

    it("reads as a badge, not a line of grey text lost beside the close control", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/a1b2c3/master.m3u8", hlsKey: "beef" });
        const badge = wrapper.find('[data-test="preview-encryption"]');

        // The stated fact is the visible one; an unencrypted collection is not an alarm.
        expect(badge.classes().join(" ")).toContain("bg-blue-100");
        expect(badge.find("svg").exists()).toBe(true);
    });

    it("leaves nothing under the player to read", async () => {
        const wrapper = await mountAndOpen({ hlsUrl: "/a1b2c3/master.m3u8" });

        expect(wrapper.find('[data-test="preview-url"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="preview-bucket"]').exists()).toBe(false);
        expect(wrapper.find('[data-test="preview-copy-url"]').exists()).toBe(false);
    });
});

/**
 * The player's own panels are written for a reader, who can do nothing about a
 * wrong key or a missing segment. These are the mistakes the preview exists to
 * catch, so they are named for the person who can fix them.
 */
describe("what the preview says when it cannot play", () => {
    const openWithPanel = async (panel: string, error?: Record<string, unknown>, props = {}) => {
        getBucketByIdMock.mockReturnValue({ publicUrl: "https://cdn.example.com/media" });
        panelState.panel = panel;
        panelState.error = error;

        const wrapper = mount(VideoPreview, {
            props: { parent: parent({ hlsUrl: "/a1b2c3/master.m3u8" }), ...props },
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        await wrapper.find('[data-test="video-preview-load"]').trigger("click");
        return wrapper;
    };

    beforeEach(() => {
        panelState.panel = undefined;
        panelState.error = undefined;
        retryMock.mockClear();
    });

    it("says nothing is at the URL yet, rather than a reader's coming-soon", async () => {
        const wrapper = await openWithPanel("coming-soon");

        expect(wrapper.find('[data-test="preview-not-yet"]').text()).toContain(
            "Nothing at this URL yet",
        );
    });

    it("says how far the encode has got, when one is running", async () => {
        const wrapper = await openWithPanel("coming-soon", undefined, {
            encodeStatus: "encoding",
            encodeProgress: 27,
        });

        expect(wrapper.find('[data-test="preview-not-yet"]').text()).toContain("27%");
    });

    it("names a wrong key as a wrong key", async () => {
        const wrapper = await openWithPanel("error", { code: "decrypt-failed" });

        expect(wrapper.find('[data-test="preview-error"]').text()).toContain("key does not match");
    });

    it("distinguishes a missing segment from a bad key", async () => {
        const wrapper = await openWithPanel("error", { code: "fetch-failed" });

        expect(wrapper.find('[data-test="preview-error"]').text()).toContain(
            "missing from the bucket",
        );
    });

    it("keeps the code for whoever is asked about it later", async () => {
        const wrapper = await openWithPanel("error", { code: "invalid-content" });

        expect(wrapper.find('[data-test="preview-error-code"]').text()).toBe("invalid-content");
    });

    it("still says something useful for a failure it has no name for", async () => {
        const wrapper = await openWithPanel("error", { code: "unknown" });

        expect(wrapper.find('[data-test="preview-error"]').text()).toContain("could not be played");
    });

    it("offers the retry the player already knows how to do", async () => {
        const wrapper = await openWithPanel("error", { code: "network" });

        await wrapper.find('[data-test="preview-retry"]').trigger("click");

        expect(retryMock).toHaveBeenCalled();
    });
});
