import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";
import waitForExpect from "wait-for-expect";
import { getRest, initConfig } from "luminary-shared";
import VideoPreview from "./VideoPreview.vue";

/**
 * The preview against a real API.
 *
 * Everything else about this component is covered with `getRest` stubbed, which
 * proves the component and proves nothing about the wiring. This runs the whole
 * chain — component, the shared REST client, real HTTP, the endpoint, CouchDB,
 * and the crypto document — with only the player itself stubbed, because video.js
 * cannot play in jsdom.
 *
 * Skipped unless LUMINARY_LIVE_API points at a running API, so it costs nothing
 * in CI and is a real check when someone stands one up:
 *
 *   LUMINARY_LIVE_API=http://127.0.0.1:3200 npx vitest run VideoPreview.live
 */
const liveApi = process.env.LUMINARY_LIVE_API;

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

vi.mock("@/composables/storageSelection", () => ({
    storageSelection: () => ({
        getBucketById: () => ({ publicUrl: "https://cdn.example.com/media" }),
    }),
}));

const player = (wrapper: any) => wrapper.findComponent({ name: "LuminaryPlayer" });

/** Seeded by the verification harness; see the scratchpad seed script. */
const ENCRYPTED_DOC = "content-visible";
const UNENCRYPTED_DOC = "post-nokey";
const FORBIDDEN_DOC = "post-private";
const EXPECTED_KEY = "aabbccddeeff00112233445566778899";

async function openPreview(docId: string, keyId?: string) {
    const wrapper = mount(VideoPreview, {
        props: {
            parent: {
                _id: docId,
                mediaBucketId: "bucket-1",
                media: { hlsUrl: "/abc/master.m3u8", ...(keyId ? { hlsKey_id: keyId } : {}) },
            } as any,
        },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.find('[data-test="video-preview-load"]').trigger("click");
    return wrapper;
}

describe.skipIf(!liveApi)("VideoPreview against a live API", () => {
    beforeAll(() => {
        initConfig({ cms: true, docsIndex: "type", apiUrl: liveApi! });
        getRest({ reset: true });
    });

    it("fetches a real key and hands it to the player", async () => {
        const wrapper = await openPreview(ENCRYPTED_DOC, "crypto-media-key");

        await waitForExpect(() =>
            expect(player(wrapper).props("source").keyHex).toBe(EXPECTED_KEY),
        );
    });

    it("plays unencrypted media with no key rather than refusing", async () => {
        // The endpoint 404s, the client turns that into undefined, and the
        // component carries on. A throw here would leave no player at all.
        const wrapper = await openPreview(UNENCRYPTED_DOC, "crypto-media-key");

        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(player(wrapper).exists()).toBe(true);
        expect(player(wrapper).props("source").keyHex).toBeUndefined();
    });

    it("plays without a key when the caller may not have one", async () => {
        // Same shape as above by design: the component cannot tell "unencrypted"
        // from "not yours", and does not need to.
        const wrapper = await openPreview(FORBIDDEN_DOC, "crypto-media-key");

        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(player(wrapper).exists()).toBe(true);
        expect(player(wrapper).props("source").keyHex).toBeUndefined();
    });
});
