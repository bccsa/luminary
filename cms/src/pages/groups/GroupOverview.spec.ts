import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import GroupOverview from "./GroupOverview.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import {
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    mockGroupDtoSuperAdmins,
    superAdminAccessMap,
} from "@/tests/mockdata";
import { accessMap, db } from "luminary-shared";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router");

describe("GroupOverview", () => {
    accessMap.value = superAdminAccessMap;

    beforeEach(() => {
        setActivePinia(createTestingPinia());
        db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicUsers,
            mockGroupDtoPublicEditors,
            mockGroupDtoSuperAdmins,
        ]);
    });

    afterEach(() => {
        vi.clearAllMocks();
        db.docs.clear();
        db.localChanges.clear();
    });

    it("displays all groups", async () => {
        const wrapper = mount(GroupOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
            expect(wrapper.text()).toContain("Public Users");
            expect(wrapper.text()).toContain("Public Editors");
            expect(wrapper.text()).toContain("Super Admins");
        });
    });

    it("can create a new group", async () => {
        const wrapper = mount(GroupOverview);

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Create group");
        });

        await wrapper.find('button[data-test="createGroupButton"]').trigger("click");

        expect(wrapper.text()).toContain("New group");
    });
});
