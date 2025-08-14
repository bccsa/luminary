import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import waitForExpect from "wait-for-expect";
import LImageProvider from "./LImageProvider.vue";

const mockImage = {
    fileCollections: [
        {
            aspectRatio: 1.33, // classic
            imageFiles: [
                { filename: "classic-100.webp", width: 100, height: 75 },
                { filename: "classic-200.webp", width: 200, height: 150 },
            ],
        },
        {
            aspectRatio: 1.78, // video
            imageFiles: [
                { filename: "video-300.webp", width: 300, height: 169 },
                { filename: "video-600.webp", width: 600, height: 338 },
            ],
        },
    ],
};

describe("LImageProvider", () => {
    it("renders the smallest image in srcset2 if all are too large for the tile", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id",
                parentWidth: 50, // smaller than any image width
                image: mockImage,
                aspectRatio: "video",
            },
        });
        await wrapper.vm.$nextTick();
        // Simulate error on image 1 to trigger image 2
        //@ts-expect-error
        wrapper.vm.imageElement1Error = true;
        await wrapper.vm.$nextTick();
        const img2 = wrapper.find('img[data-test="image-element2"]');
        expect(img2.exists()).toBe(true);
        // Should contain the smallest image from the classic collection (since video is closest, classic is srcset2)
        expect(img2.attributes("srcset")).toContain("classic-100.webp");
    });
    it("renders fallback image when no main images are available", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id",
                parentWidth: 600,
            },
        });

        await wrapper.vm.$nextTick();

        // Simulate both image errors to force fallback rendering
        //@ts-expect-error
        wrapper.vm.imageElement1Error = true;
        //@ts-expect-error
        wrapper.vm.imageElement2Error = true;
        await wrapper.vm.$nextTick();

        const fallbackImg = wrapper.find('img[data-test="image-element2"]');
        await waitForExpect(() => {
            expect(fallbackImg.exists()).toBe(true);
            expect(fallbackImg.attributes("src")).toContain("webp");
        });
    });

    it("does not filter out higher quality images when isModal is true", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-modal",
                parentWidth: 50, // Smaller than larger images to ensure filtering would normally occur
                image: mockImage,
                aspectRatio: "video",
                isModal: true, // Set isModal to true
            },
        });
        await wrapper.vm.$nextTick();

        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.exists()).toBe(true);

        // Expect the srcset to contain larger images that would normally be filtered out
        expect(img1.attributes("srcset")).toContain("video-300.webp");
        expect(img1.attributes("srcset")).toContain("video-600.webp");
    });
});
