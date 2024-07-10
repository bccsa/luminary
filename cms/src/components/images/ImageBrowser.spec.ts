import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "luminary-shared";
import ImageBrowser from "./ImageBrowser.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";
import { mockImageDto } from "../../../../mockdata/mockData";

describe("ImageBrowser", () => {
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
                whereTypeAsRef: () => [],
                uuid: () => "image-uuid",
            },
        }));

        setActivePinia(createTestingPinia());
    });

    it("can create a new image document", async () => {
        const upsertSpy = vi.spyOn(db, "upsert");
        vi.spyOn(db, "getAsRef").mockReturnValue(ref(mockImageDto));

        const wrapper = mount(ImageBrowser);

        wrapper.find("[data-test='new-image']").trigger("click");

        expect(upsertSpy).toHaveBeenCalled();
    });
});
