import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import ImageEditor from "./ImageEditor.vue";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { accessMap } from "luminary-shared";
import { mockPostDto, superAdminAccessMap } from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

describe("ImageEditor", () => {
    beforeAll(async () => {
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

        setActivePinia(createTestingPinia());

        accessMap.value = superAdminAccessMap;
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can render an image document", async () => {
        // vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImageDto));

        const wrapper = mount(ImageEditor, {
            props: { imageData: mockPostDto.imageData, disabled: false },
        });

        const imageFiles = wrapper.find("div[data-test='thumbnail-area']");

        expect(imageFiles.html()).toContain(
            mockPostDto.imageData!.fileCollections[0].imageFiles[0].filename,
        );
    });
});
