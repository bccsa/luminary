import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AddGroupAclButton from "./AddGroupAclButton.vue";
import {
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
} from "@/tests/mockdata";

describe("AddGroupAclButton", () => {
    const addGroupButton = 'button[data-test="addGroupButton"]';
    const selectGroupButton = 'button[data-test="selectGroupButton"]';

    it("shows all given groups", async () => {
        const wrapper = mount(AddGroupAclButton, {
            props: {
                groups: [
                    mockGroupDtoPublicContent,
                    mockGroupDtoPublicEditors,
                    mockGroupDtoPublicUsers,
                ],
            },
            global: {
                stubs: {
                    Teleport: true,
                },
            },
        });

        await wrapper.find(addGroupButton).trigger("click");

        expect(wrapper.text()).toContain("Public Content");
        expect(wrapper.text()).toContain("Public Editors");
        expect(wrapper.text()).toContain("Public Users");
    });

    it("emits an event when clicking a group", async () => {
        const wrapper = mount(AddGroupAclButton, {
            props: {
                groups: [
                    mockGroupDtoPublicContent,
                    mockGroupDtoPublicEditors,
                    mockGroupDtoPublicUsers,
                ],
            },
            global: {
                stubs: {
                    Teleport: true,
                },
            },
        });

        await wrapper.find(addGroupButton).trigger("click");
        await wrapper.find(selectGroupButton).trigger("click");

        expect(wrapper.emitted("select")?.length).toBe(1);
        // @ts-ignore
        expect(wrapper.emitted("select")![0][0].name).toEqual("Public Content");
    });
});
