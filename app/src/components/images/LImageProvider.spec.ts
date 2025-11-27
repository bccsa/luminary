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
    it("does not load fallback image if either main image loads successfully", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id",
                parentWidth: 50,
                image: mockImage,
                aspectRatio: "video",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        // No error simulated, should not show fallback
        const img1 = wrapper.find('img[data-test="image-element1"]');
        const img2 = wrapper.find('img[data-test="image-element2"]');
        expect(img1.exists() || img2.exists()).toBe(true);
        const fallbackImg = wrapper
            .findAll("img")
            .find(
                (img) =>
                    img.attributes("src")?.includes("webp") &&
                    img.attributes("data-test") === "image-element2",
            );
        expect(fallbackImg).toBeUndefined();
    });

    it("loads fallback image only when both imageElement1Error and imageElement2Error are true", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-fallback",
                parentWidth: 600,
                image: mockImage,
                aspectRatio: "video",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
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

    it("does not load fallback image if srcset1 or srcset2 is available and no error occurred", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-srcset",
                parentWidth: 600,
                image: mockImage,
                aspectRatio: "video",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        // Should show main image, not fallback
        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.exists()).toBe(true);
        expect(img1.attributes("srcset")).toContain("video-300.webp");
        expect(img1.attributes("srcset")).toContain("video-600.webp");
    });

    it("does not filter out higher quality images when isModal is true", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-modal",
                parentWidth: 50,
                image: mockImage,
                aspectRatio: "video",
                isModal: true,
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.exists()).toBe(true);
        expect(img1.attributes("srcset")).toContain("video-300.webp");
        expect(img1.attributes("srcset")).toContain("video-600.webp");
    });
});
