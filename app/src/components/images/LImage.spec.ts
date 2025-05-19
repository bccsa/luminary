import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import LImage from "./LImage.vue";
import { describe, expect, it } from "vitest";
import { mockImageDto } from "../../tests/mockdata";
import waitForExpect from "wait-for-expect";

describe("LImage", () => {
    it("displays an image", async () => {
        const wrapper = mount(LImage, {
            propsData: {
                contentParentId: "",
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
});
