import "fake-indexeddb/auto";
import {
    mockGroupDtoPrivateContent,
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    superAdminAccessMap,
} from "@/tests/mockdata";
import { accessMap, db, DocType } from "luminary-shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import LCombobox from "./LCombobox.vue";
import waitForExpect from "wait-for-expect";

describe("LCombobox", () => {
    accessMap.value = superAdminAccessMap;

    beforeAll(async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoPrivateContent,
        ]);
    });

    afterEach(async () => {
        vi.clearAllMocks();
    });

    afterAll(async () => {
        await db.docs.clear();
    });

    it("displays selected groups", async () => {
        const wrapper = mount(LCombobox, {
            props: {
                groups: [mockGroupDtoPublicContent._id],
                docType: DocType.Post,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Private Content ");
            expect(wrapper.text()).toContain("Public Content");
        });
    });

    it("displays all available groups", async () => {
        const wrapper = mount(LCombobox, {
            props: {
                groups: [],
                docType: DocType.Post,
            },
        });

        await wrapper.find("[name='options-open-btn']").trigger("click");

        await wrapper.vm.$nextTick();

        await waitForExpect(() => {
            const groups = wrapper.find('[data-test="groups"]');
            expect(groups.text()).toContain("Public Content");
            expect(groups.text()).toContain("Public Users");
            expect(groups.text()).toContain("Public Editors");
            expect(groups.text()).toContain("Private Content");
        });
    });
});
