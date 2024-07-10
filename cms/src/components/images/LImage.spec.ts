import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import LImage from "./LImage.vue";
import { describe, expect, it, vi } from "vitest";
import { db } from "luminary-shared";
import { ref } from "vue";
import { mockImageDto } from "../../../../mockdata/mockData";
import waitForExpect from "wait-for-expect";

describe("LImage", () => {
    it("displays an image", async () => {
        vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImageDto));
        const wrapper = mount(LImage, {
            propsData: {
                image: mockImageDto,
                aspectRatio: "video",
                size: "thumbnail",
                baseUrl: "@/tests",
                fallbackImg: "@/tests/test-image.webp",
            },
        });

        await waitForExpect(() => {
            const imageElement = wrapper.find("img");
            expect(imageElement.attributes("srcset")).toContain("@/tests/test-image.webp");
        });
    });
});
