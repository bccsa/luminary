import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import GroupsPage from "./GroupsPage.vue";
import { createTestingPinia } from "@pinia/testing";
import { setActivePinia } from "pinia";
import { useGroupStore } from "@/stores/group";
import {
    mockGroupPublicContent,
    mockGroupPublicEditors,
    mockGroupPublicUsers,
    mockGroupSuperAdmins,
} from "@/tests/mockData";

vi.mock("@auth0/auth0-vue");

describe("GroupsPage", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays all groups", async () => {
        const groupStore = useGroupStore();
        groupStore.groups = [
            mockGroupPublicContent,
            mockGroupPublicUsers,
            mockGroupPublicEditors,
            mockGroupSuperAdmins,
        ];

        const wrapper = mount(GroupsPage);

        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Users");
        expect(wrapper.text()).toContain("Public Editors");
        expect(wrapper.text()).toContain("Super Admins");
    });
});
