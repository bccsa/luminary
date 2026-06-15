import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import waitForExpect from "wait-for-expect";

// Mock only `isSaveDataEnabled` so we can simulate Data Saver; everything else is the real module.
vi.mock("@/globalConfig", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/globalConfig")>();
    return { ...actual, isSaveDataEnabled: vi.fn(() => false) };
});
import { isSaveDataEnabled } from "@/globalConfig";
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
        // The browser picks the variant from the full ladder using the `sizes` attribute (no JS
        // width pre-filter, no DPR math — the browser applies DPR itself). The leading
        // `prefers-reduced-data` condition lets supporting browsers downshift; everyone else falls
        // through to the full slot (default size="post").
        expect(img1.attributes("sizes")).toBe(
            "(prefers-reduced-data: reduce) 50vw, (min-width: 1024px) 800px, 100vw",
        );
    });

    it("emits the full srcset ladder and a slot-correct `sizes` for a thumbnail", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-thumb",
                image: mockImage,
                aspectRatio: "video",
                size: "thumbnail",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.exists()).toBe(true);
        // Full ladder offered regardless of slot width — the browser, not JS, narrows it down.
        expect(img1.attributes("srcset")).toContain("video-300.webp 300w");
        expect(img1.attributes("srcset")).toContain("video-600.webp 600w");
        expect(img1.attributes("sizes")).toBe(
            "(prefers-reduced-data: reduce) 144px, (min-width: 768px) 208px, 144px",
        );
    });

    it("advertises only the reduced slot when Data Saver is enabled", async () => {
        vi.mocked(isSaveDataEnabled).mockReturnValueOnce(true);
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-savedata",
                image: mockImage,
                aspectRatio: "video",
                size: "thumbnail",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        // Forced smaller slot, no media-query fallthrough — the full ladder is still offered, the
        // browser just fetches a lower variant for it.
        expect(img1.attributes("sizes")).toBe("144px");
        expect(img1.attributes("srcset")).toContain("video-600.webp 600w");
    });

    it("renders the decoded ThumbHash as the display image background", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-thumbhash",
                aspectRatio: "video",
                bucketPublicUrl: "https://bucket.example.com",
                image: {
                    fileCollections: [
                        {
                            aspectRatio: 1.78,
                            // Canonical valid ThumbHash example (evanw/thumbhash), so decoding succeeds.
                            thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
                            imageFiles: [{ filename: "video-300.webp", width: 300, height: 169 }],
                        },
                    ],
                } as any,
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.exists()).toBe(true);
        expect(img1.attributes("style")).toContain("background-image");
        expect(img1.attributes("style")).toContain("data:image/png");
    });

    it("does not filter out higher quality images when isModal is true", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-modal",
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

    it("does not set crossorigin attribute on images to avoid CORS errors with external storage", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-cors",
                image: mockImage,
                aspectRatio: "video",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();

        const images = wrapper.findAll("img");
        expect(images.length).toBeGreaterThan(0);
        for (const img of images) {
            expect(img.attributes("crossorigin")).toBeUndefined();
        }
    });

    it("does not set crossorigin attribute on modal images", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-cors-modal",
                image: mockImage,
                aspectRatio: "video",
                isModal: true,
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();

        const images = wrapper.findAll("img");
        expect(images.length).toBeGreaterThan(0);
        for (const img of images) {
            expect(img.attributes("crossorigin")).toBeUndefined();
        }
    });

    it("renders fallback image in modal mode when primary image fails", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-modal-fallback",
                isModal: true,
                bucketPublicUrl: "https://bucket.example.com",
                image: {
                    fileCollections: [
                        {
                            aspectRatio: 1.78,
                            imageFiles: [{ filename: "img.jpg", width: 100, height: 100 }],
                        },
                    ],
                } as any,
            },
        });

        const img = wrapper.find('img[data-test="image-element1"]');
        expect(img.exists()).toBe(true);
        expect(img.attributes("src")).toBe("https://bucket.example.com/img.jpg");

        await img.trigger("error");
        await wrapper.vm.$nextTick();

        // Check if fallback image is displayed
        // We look for an image that is NOT the broken one
        const images = wrapper.findAll("img");
        const fallback = images.find((i) => {
            const src = i.attributes("src");
            return src && src !== "https://bucket.example.com/img.jpg" && src.length > 0;
        });

        expect(fallback).toBeDefined();
    });
});
