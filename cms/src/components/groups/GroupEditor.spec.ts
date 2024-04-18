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

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: vi.fn(),
    })),
    onBeforeRouteLeave: vi.fn(),
}));

describe("GroupEditor", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        const groupStore = useGroupStore();
        groupStore.groups = [
            mockGroupPublicContent,
            mockGroupPublicUsers,
            mockGroupPublicEditors,
            mockGroupSuperAdmins,
        ];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays all ACL groups under the given group", async () => {
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

    it("displays buttons when changing a value", async () => {
        const wrapper = mount(GroupEditor, {
            props: {
                group: mockGroupPublicContent,
            },
        });

        // Open up the accordion
        await wrapper.find("button").trigger("click");

        await wrapper.find('[data-test="permissionCell"]').trigger("click");

        expect(wrapper.text()).toContain("Discard changes");
        expect(wrapper.text()).toContain("Save changes");
    });
});
