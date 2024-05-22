import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import {
    mockGroupPublicContent,
    mockGroupPublicEditors,
    mockGroupPublicUsers,
    mockGroupSuperAdmins,
    mockLanguageEng,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { useGroupStore } from "@/stores/group";
import GroupSelector from "./GroupSelector.vue";
import { Combobox } from "@headlessui/vue";
import LTag from "./LTag.vue";

describe("GroupSelector", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());

        const groupStore = useGroupStore();
        groupStore.groups = [mockGroupPublicContent];
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays selected groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupPublicContent],
                selectedGroups: [mockGroupPublicContent],
                language: mockLanguageEng,
            },
        });

        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).not.toContain("Topic A");
    });

    it("displays all available groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupPublicContent, mockGroupPublicUsers],
                selectedGroups: [],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("button").trigger("click"); // First button is the dropdown button

        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Users");
    });

    it("can filter on groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupPublicEditors, mockGroupSuperAdmins],
                selectedGroups: [],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("input").setValue("edit");

        expect(wrapper.text()).toContain("Public Editors");
        expect(wrapper.text()).not.toContain("Super Admins");
    });

    it("emits an event when selecting a group", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupPublicContent, mockGroupSuperAdmins],
                selectedGroups: [],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("input").setValue("public");
        await wrapper.find("li").trigger("click");

        const selectEvent: any = wrapper.emitted("select");
        expect(selectEvent).not.toBe(undefined);
        expect(selectEvent![0][0]).toEqual(mockGroupPublicContent);
    });

    it("emits an event when removing a group", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupPublicContent, mockGroupPublicUsers],
                selectedGroups: [mockGroupPublicContent],
                language: mockLanguageEng,
            },
        });

        await wrapper.find("button[data-test='removeTag']").trigger("click");

        const removeEvent: any = wrapper.emitted("remove");
        expect(removeEvent).not.toBe(undefined);
        expect(removeEvent![0][0]).toEqual(mockGroupPublicContent);
    });

    it("disables the box and groups when it's disabled", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupPublicContent],
                selectedGroups: [mockGroupPublicContent],
                language: mockLanguageEng,
                disabled: true,
            },
        });

        expect(wrapper.findComponent(Combobox).props().disabled).toBe(true);
        expect(wrapper.findComponent(LTag).props().disabled).toBe(true);
    });
});
