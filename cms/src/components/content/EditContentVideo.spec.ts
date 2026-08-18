import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { type ContentParentDto, accessMap } from "luminary-shared";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { ref } from "vue";
import EditContentVideo from "./EditContentVideo.vue";

const HLS_URL = "https://example.com/media/post/master.m3u8";

const parentWith = (media?: Partial<NonNullable<ContentParentDto["media"]>>) =>
    ref<ContentParentDto>({
        ...mockData.mockPostDto,
        media: media ? ({ fileCollections: [], ...media } as any) : undefined,
    } as ContentParentDto);

const mountVideo = (parent: ReturnType<typeof parentWith>) =>
    mount(EditContentVideo, {
        props: { disabled: false, parent: parent.value },
    });

describe("EditContentVideo.vue", () => {
    beforeAll(async () => {
        setActivePinia(createTestingPinia());
        accessMap.value = mockData.fullAccessToAllContentMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("displays the video card", async () => {
        const wrapper = mountVideo(parentWith({ hlsUrl: HLS_URL }));

        expect(wrapper.find('div[data-test="videoContent"]').exists()).toBe(true);
    });

    it("shows the playlist URL from media", async () => {
        const wrapper = mountVideo(parentWith({ hlsUrl: HLS_URL }));

        const input = wrapper.find("input[name='video']").element as HTMLInputElement;
        expect(input.value).toBe(HLS_URL);
    });

    it("writes an edited URL back to media", async () => {
        const parent = parentWith({ hlsUrl: HLS_URL });
        const wrapper = mountVideo(parent);

        await wrapper.find("input[name='video']").setValue("https://example.com/new.m3u8");

        expect(parent.value.media?.hlsUrl).toBe("https://example.com/new.m3u8");
    });

    it("creates media on a document that has none, rather than dropping the edit", async () => {
        const parent = parentWith();
        const wrapper = mountVideo(parent);

        await wrapper.find("input[name='video']").setValue(HLS_URL);

        expect(parent.value.media?.hlsUrl).toBe(HLS_URL);
    });

    it("writes an entered encryption key to media", async () => {
        const parent = parentWith({ hlsUrl: HLS_URL });
        const wrapper = mountVideo(parent);

        await wrapper.find("input[name='hlsKey']").setValue("0123456789abcdef");

        expect(parent.value.media?.hlsKey).toBe("0123456789abcdef");
    });

    it("clears the key rather than storing an empty string", async () => {
        const parent = parentWith({ hlsUrl: HLS_URL, hlsKey: "0123456789abcdef" });
        const wrapper = mountVideo(parent);

        await wrapper.find("input[name='hlsKey']").setValue("");

        expect(parent.value.media?.hlsKey).toBeUndefined();
    });

    it("says a key is saved when the document holds only its reference", async () => {
        // After a save the key itself is gone — the API keeps a crypto object and
        // returns its id — so an empty field must not read as "no key".
        const wrapper = mountVideo(parentWith({ hlsUrl: HLS_URL, hlsKey_id: "crypto-1" }));

        expect(wrapper.find('[data-test="video-key-note"]').text()).toContain(
            "encryption key is saved",
        );
    });

    it("warns before a saved key is replaced", async () => {
        // The one edit on this form that cannot be undone: the media was
        // encrypted with the old key and nothing keeps a copy of it.
        const wrapper = mountVideo(parentWith({ hlsUrl: HLS_URL, hlsKey_id: "crypto-1" }));
        expect(wrapper.find('[data-test="video-key-warning"]').exists()).toBe(false);

        await wrapper.find("input[name='hlsKey']").setValue("beefbeefbeefbeef");

        expect(wrapper.find('[data-test="video-key-warning"]').text()).toContain(
            "unplayable",
        );
    });

    it("does not warn when there is no saved key to replace", async () => {
        const wrapper = mountVideo(parentWith({ hlsUrl: HLS_URL }));

        await wrapper.find("input[name='hlsKey']").setValue("beefbeefbeefbeef");

        expect(wrapper.find('[data-test="video-key-warning"]').exists()).toBe(false);
    });

    it("explains when no key is needed", async () => {
        const wrapper = mountVideo(parentWith({ hlsUrl: HLS_URL }));

        expect(wrapper.find('[data-test="video-key-note"]').text()).toContain("encrypted");
    });

    it("disables both fields when the user cannot edit", async () => {
        const wrapper = mount(EditContentVideo, {
            props: { disabled: true, parent: parentWith({ hlsUrl: HLS_URL }).value },
        });

        expect(wrapper.find("input[name='video']").attributes("disabled")).toBeDefined();
        expect(wrapper.find("input[name='hlsKey']").attributes("disabled")).toBeDefined();
    });
});
