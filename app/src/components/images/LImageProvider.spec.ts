import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import waitForExpect from "wait-for-expect";

// Mock only `isDataSaverEnabled` so we can simulate Data Saver; everything else is the real module.
vi.mock("@/globalConfig", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/globalConfig")>();
    return { ...actual, isDataSaverEnabled: vi.fn(() => false) };
});
// Mock the speed probe so we can drive the "slow connection" branch without timing a real download.
vi.mock("@/composables/useNetworkSpeed", async () => {
    const { ref } = await import("vue");
    const isSlowConnection = ref(false);
    const connectionSpeed = ref(10);
    return {
        isSlowConnection,
        connectionSpeed,
        useNetworkSpeed: () => ({ isSlowConnection, connectionSpeed, runProbe: vi.fn() }),
    };
});
import { isDataSaverEnabled, userDataSaverEnabled } from "@/globalConfig";
import { isSlowConnection } from "@/composables/useNetworkSpeed";
import LImageProvider from "./LImageProvider.vue";

// `isSlowConnection` is a real (mocked) ref here; treat it as writable in tests.
const slow = isSlowConnection as unknown as { value: boolean };

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
    afterEach(() => {
        slow.value = false;
        userDataSaverEnabled.value = false;
        Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
    });

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

    it("inflates `sizes` when a wide source is cover-cropped into a narrower (portrait) box", async () => {
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-portrait",
                image: mockImage,
                aspectRatio: "portrait", // 0.75 box; closest source collection is 1.33 (wider)
                size: "thumbnailCompact",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.exists()).toBe(true);
        // object-cover over-scales the 1.33 source to fill the 0.75 box by 1.33/0.75 = 1.773x, so the
        // full-quality base lengths are inflated by that factor (176->312, 128->227) to make the
        // browser fetch a high-enough variant. The 768px media-query breakpoint is left untouched, and
        // the reduced-data slot (128px) is NOT inflated — Data Saver users keep the smaller variant.
        expect(img1.attributes("sizes")).toBe(
            "(prefers-reduced-data: reduce) 128px, (min-width: 768px) 312px, 227px",
        );
    });

    it("does not inflate the reduced slot under Data Saver, even for a cover-cropped box", async () => {
        vi.mocked(isDataSaverEnabled).mockReturnValueOnce(true);
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-portrait-savedata",
                image: mockImage,
                aspectRatio: "portrait", // wide source cover-cropped into a narrow box
                size: "thumbnailCompact",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        // Data Saver wins over cover-crop inflation: the original small slot is advertised, unscaled.
        expect(img1.attributes("sizes")).toBe("128px");
    });

    it("advertises only the reduced slot when Data Saver is enabled", async () => {
        vi.mocked(isDataSaverEnabled).mockReturnValueOnce(true);
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

    // A collection with a high-res rung, to prove the FULL ladder is kept (reduced mode shrinks
    // `sizes`, it does NOT drop srcset entries).
    const mockImageLarge = {
        fileCollections: [
            {
                aspectRatio: 1.78, // video
                imageFiles: [
                    { filename: "video-300.webp", width: 300, height: 169 },
                    { filename: "video-600.webp", width: 600, height: 338 },
                    { filename: "video-1200.webp", width: 1200, height: 675 },
                ],
            },
        ],
    };

    it("caps the effective DPR on a slow connection so a retina device fetches a lower-res variant", async () => {
        Object.defineProperty(window, "devicePixelRatio", { value: 3, configurable: true });
        slow.value = true;
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-slow",
                image: mockImageLarge,
                aspectRatio: "video",
                size: "thumbnail",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        // Reduced slot (144px) divided by DPR 3 → 48px, so the browser fetches a ~1x image.
        expect(img1.attributes("sizes")).toBe("48px");
        // The full srcset ladder is still offered — only `sizes` shrank, no rungs dropped.
        const srcset = img1.attributes("srcset") ?? "";
        expect(srcset).toContain("video-300.webp 300w");
        expect(srcset).toContain("video-600.webp 600w");
        expect(srcset).toContain("video-1200.webp 1200w");
    });

    it("DPR-caps the declarative reduced-data slot even when not in reduced mode", async () => {
        Object.defineProperty(window, "devicePixelRatio", { value: 3, configurable: true });
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-prefers",
                image: mockImageLarge,
                aspectRatio: "video",
                size: "thumbnail",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        // The `prefers-reduced-data` value is the DPR-capped 48px; everyone else falls through to 144px.
        expect(img1.attributes("sizes")).toBe(
            "(prefers-reduced-data: reduce) 48px, (min-width: 768px) 208px, 144px",
        );
    });

    it("caps the effective DPR when the user's Data Saver toggle is on", async () => {
        Object.defineProperty(window, "devicePixelRatio", { value: 3, configurable: true });
        userDataSaverEnabled.value = true;
        const wrapper = mount(LImageProvider, {
            props: {
                parentId: "test-id-toggle",
                image: mockImageLarge,
                aspectRatio: "video",
                size: "thumbnail",
                bucketPublicUrl: "https://bucket.example.com",
            },
        });
        await wrapper.vm.$nextTick();
        const img1 = wrapper.find('img[data-test="image-element1"]');
        expect(img1.attributes("sizes")).toBe("48px");
        // Full ladder retained.
        expect(img1.attributes("srcset")).toContain("video-1200.webp 1200w");
    });
});
