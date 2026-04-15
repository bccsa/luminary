import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import LImage from "./LImage.vue";
import { describe, expect, it, vi } from "vitest";
import { mockImageDto } from "../../tests/mockdata";
import waitForExpect from "wait-for-expect";
import { computed } from "vue";

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({
        bucketBaseUrl: computed(() => "https://bucket.example.com"),
    }),
}));

describe("LImage", () => {
    it("displays an image", async () => {
        const wrapper = mount(LImage, {
            propsData: {
                contentParentId: "" as string,
                image: mockImageDto,
                aspectRatio: "video",
                size: "thumbnail",
            },
        });

        await waitForExpect(() => {
            const imageElement = wrapper.find("img");
            expect(imageElement.attributes("srcset")).toContain("test-image.webp");
        });
    });

    it("renders a direct <img> when the `src` prop is provided, bypassing responsive logic", () => {
        const wrapper = mount(LImage, {
            propsData: {
                src: "https://cdn.example.com/icon.svg",
            },
        });

        const img = wrapper.find("img");
        expect(img.exists()).toBe(true);
        expect(img.attributes("src")).toBe("https://cdn.example.com/icon.svg");
        expect(img.attributes("srcset")).toBeUndefined();
    });

    it("applies opacity style only when `opacity` is not 1 in src mode", () => {
        const withOpacity = mount(LImage, {
            propsData: {
                src: "https://cdn.example.com/icon.svg",
                opacity: 0.5,
            },
        });
        expect(withOpacity.find("img").attributes("style")).toContain("opacity");

        const fullOpacity = mount(LImage, {
            propsData: {
                src: "https://cdn.example.com/icon.svg",
            },
        });
        expect(fullOpacity.find("img").attributes("style")).toBeUndefined();
    });

    it("renders icon mode without aspect-ratio container and passes is-icon to the provider", async () => {
        const wrapper = mount(LImage, {
            propsData: {
                contentParentId: "parent-1",
                image: mockImageDto,
                size: "icon",
            },
        });

        await waitForExpect(() => {
            const provider = wrapper.findComponent({ name: "LImageProvider" });
            expect(provider.exists()).toBe(true);
            expect(provider.props("isIcon")).toBe(true);
            expect(provider.props("rounded")).toBe(false);
        });
    });
});
