import { mount } from "@vue/test-utils";
import LImage from "./LImage.vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { mockImage } from "@/tests/mockData";
import waitForExpect from "wait-for-expect";

describe("LImage", () => {
    beforeAll(() => {
        // We need to mock Dexie (and Dexie's liveQuery) as it returns a promise(?) that Vitest doesn't like.
        // So we are not testing the actual liveQuery functionality here but rather the component itself.
        vi.mock("@/db/baseDatabase", () => ({
            db: {
                docs: {
                    put: vi.fn(),
                    get: vi.fn(),
                },
                getAsRef: vi.fn(),
                upsert: vi.fn(),
            },
        }));
    });
    it("displays an image", async () => {
        const spyOn_getAsRef = vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImage));
        const wrapper = mount(LImage, {
            propsData: {
                imageId: "image-image1",
                aspectRatio: "video",
                size: "thumbnail",
                baseUrl: "@/tests",
                fallbackImg: "@/tests/test-image.webp",
            },
        });

        expect(spyOn_getAsRef).toHaveBeenCalledWith("image-image1");

        await waitForExpect(() => {
            const imageElement = wrapper.find("img");
            expect(imageElement.attributes("src")).toBe("@/tests/test-image.webp");
        });
    });
});
