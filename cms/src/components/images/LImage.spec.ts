import { mount } from "@vue/test-utils";
import LImage from "./LImage.vue";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { mockImage } from "@/tests/mockData";
import waitForExpect from "wait-for-expect";

describe("LImage", () => {
    it("displays an image", async () => {
        vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImage));
        const wrapper = mount(LImage, {
            propsData: {
                image: mockImage,
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
