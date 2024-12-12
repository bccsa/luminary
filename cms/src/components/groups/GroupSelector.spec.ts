import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import {
    mockGroupDtoPrivateContent,
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    superAdminAccessMap,
} from "@/tests/mockdata";

import GroupSelector from "./GroupSelector.vue";
import LTag from "../content/LTag.vue";
import { accessMap, db, DocType } from "luminary-shared";
import waitForExpect from "wait-for-expect";
import LCombobox from "../forms/LCombobox.vue";

describe("GroupSelector", () => {
    // Need to set the access map before starting the tests. When moving this to beforeAll, it fails for some or other reason.
    accessMap.value = superAdminAccessMap;

    beforeEach(async () => {
        await db.docs.bulkPut([
            mockGroupDtoPublicContent,
            mockGroupDtoPublicEditors,
            mockGroupDtoPublicUsers,
            mockGroupDtoPrivateContent,
        ]);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await db.docs.clear();
        await db.localChanges.clear();
    });

    it("displays selected groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupDtoPublicContent._id],
                docType: DocType.Post,
            },
        });

        await waitForExpect(() => {
            const tagDiv = wrapper.findComponent(LCombobox).findComponent(LTag);

            expect(tagDiv.text()).toContain("Public Content");
            expect(tagDiv.text()).not.toContain("Private Content");
        });
    });

    it("displays all available groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [],
                docType: DocType.Post,
            },
        });

        await wrapper.find("button").trigger("click"); // First button is the dropdown button

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
            expect(wrapper.text()).toContain("Public Users");
            expect(wrapper.text()).toContain("Public Editors");
            expect(wrapper.text()).toContain("Private Content");
        });
    });

    it("hides groups to which the user does not have document edit access", async () => {
        // Remove assign access to the Public Users group
        // @ts-ignore
        accessMap.value[mockGroupDtoPublicUsers._id].post.edit = false;

        const wrapper = mount(GroupSelector, {
            props: {
                groups: [],
                docType: DocType.Post,
            },
        });

        await wrapper.find("button").trigger("click"); // First button is the dropdown button

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Content");
            expect(wrapper.text()).toContain("Public Editors");
            expect(wrapper.text()).toContain("Private Content");

            expect(wrapper.text()).not.toContain("Public Users");
        });
    });

    it("Updates the passed array when selecting a group", async () => {
        const groups: string[] = [];
        const wrapper = mount(GroupSelector, {
            props: {
                groups,
                "onUpdate:groups": (e: any) => wrapper.setProps({ groups: e }),
                docType: DocType.Post,
            },
        });

        //@ts-expect-error
        wrapper.vm.availableGroups = await db.docs.toArray();

        const combobox = wrapper.findComponent(LCombobox);
        await combobox.find('[name="options-open-btn"]').trigger("click");

        const groupLi = await combobox.findAll("li");
        await groupLi[1].trigger("click");

        // Ensure the groups array is updated
        await waitForExpect(async () => {
            expect(wrapper.vm.groups).toContain("group-public-content");
        });
    });

    it("Updates the passed array when removing a group", async () => {
        const groups: string[] = [mockGroupDtoPublicEditors._id];
        const wrapper = mount(GroupSelector, {
            props: {
                groups: groups,
                docType: DocType.Post,
            },
        });

        expect(groups).toContain(mockGroupDtoPublicEditors._id);

        // Wait for the list to be populated and filtered
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Editors");
        });

        await wrapper.find("button[data-test='removeTag']").trigger("click");

        await waitForExpect(async () => {
            expect(groups).not.toContain(mockGroupDtoPublicEditors._id);
        });
    });

    it("disables the box and groups when it's disabled", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupDtoPublicContent._id],
                disabled: true,
                docType: DocType.Post,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(LCombobox).props().disabled).toBe(true);
            expect(wrapper.findComponent(LTag).props().disabled).toBe(true);
        });
    });
});
