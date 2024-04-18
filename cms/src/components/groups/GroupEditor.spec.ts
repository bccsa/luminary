import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import GroupEditor from "./GroupEditor.vue";
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

vi.mock("vue-router");

describe("GroupEditor", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays all ACL groups under the given group", async () => {
        const groupStore = useGroupStore();
        groupStore.groups = [
            mockGroupPublicContent,
            mockGroupPublicUsers,
            mockGroupPublicEditors,
            mockGroupSuperAdmins,
        ];

        const wrapper = mount(GroupEditor, {
            props: {
                group: mockGroupPublicContent,
            },
        });

        // Open up the accordion
        await wrapper.find("button").trigger("click");

        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Users");
        expect(wrapper.text()).toContain("Public Editors");
    });
});
