import "fake-indexeddb/auto";
import { DOMWrapper, mount } from "@vue/test-utils";
import ImageEditor from "./ImageEditor.vue";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db, accessMap } from "luminary-shared";
import { fullAccessToAllContentMap, mockImageDto } from "../../../../mockdata/mockData";
import { ref } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useGlobalConfigStore } from "@/stores/globalConfig";

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

        const globalConfigStore = useGlobalConfigStore();
        accessMap.value = fullAccessToAllContentMap;
        globalConfigStore.clientAppUrl = "http://localhost:4174";
    });

    afterAll(() => {
        vi.clearAllMocks();
    });

    it("can render an image document", async () => {
        vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImageDto));

        const wrapper = mount(ImageEditor, {
            props: { imageId: "image-image1" },
        });

        const imageNameInput = wrapper.find(
            "input[data-test='image-name']",
        ) as DOMWrapper<HTMLInputElement>;
        expect(imageNameInput.element.value).toBe(mockImageDto.name);

        const imageDescriptionInput = wrapper.find(
            "textarea[data-test='image-description']",
        ) as DOMWrapper<HTMLTextAreaElement>;
        expect(imageDescriptionInput.element.value).toBe(mockImageDto.description);

        const imageFiles = wrapper.find("div[data-test='thumbnail-area']");
        expect(imageFiles.html()).toContain(mockImageDto.fileCollections[0].imageFiles[0].filename);
    });

    it("can save an image document", async () => {
        vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImageDto));
        const spyOn_upsert = vi.spyOn(db, "upsert");

        const wrapper = mount(ImageEditor, {
            props: { imageId: "image-image1" },
        });

        const nameInput = wrapper.find("input[data-test='image-name']");
        await nameInput.setValue("New Name");

        expect(spyOn_upsert).toHaveBeenCalledWith({ ...mockImageDto, name: "New Name" });

        const descriptionInput = wrapper.find("textarea[data-test='image-description']");
        await descriptionInput.setValue("New Description");

        expect(spyOn_upsert).toHaveBeenCalledWith({
            ...mockImageDto,
            name: "New Name",
            description: "New Description",
        });
    });
});
