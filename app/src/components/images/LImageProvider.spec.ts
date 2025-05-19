import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import waitForExpect from "wait-for-expect";
import LImageProvider from "./LImageProvider.vue";
import * as fallbackImageUtil from "@/util/loadFallbackImages";

describe("LImage", () => {
    it("renders fallback image when no main images are available", async () => {
        const mockFallbackUrl = "/assets/fallbackImages/mock-image.png";
        vi.spyOn(fallbackImageUtil, "loadFallbackImageUrls").mockResolvedValue([mockFallbackUrl]);

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
            expect(fallbackImg.attributes("src")).toBe(mockFallbackUrl);
        });
    });
});
