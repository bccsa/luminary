import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, vi, beforeAll, afterAll } from "vitest";
import { mount } from "@vue/test-utils";
import {
    mockGroupDtoPrivateContent,
    mockGroupDtoPublicContent,
    mockGroupDtoPublicEditors,
    mockGroupDtoPublicUsers,
    superAdminAccessMap,
} from "@/tests/mockdata";

import GroupSelector from "./GroupSelector.vue";
import { Combobox } from "@headlessui/vue";
import LTag from "../content/LTag.vue";
import { accessMap, db } from "luminary-shared";
import waitForExpect from "wait-for-expect";

describe("GroupSelector", () => {
    // Need to set the access map before starting the tests. When moving this to beforeAll, it fails for some or other reason.
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
        await db.localChanges.clear();
    });

    it("displays selected groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [mockGroupDtoPublicContent._id],
            },
        });

        await waitForExpect(() => {
            expect(wrapper.text()).not.toContain("Private Content");
            expect(wrapper.text()).toContain("Public Content");
        });
    });

    it("displays all available groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [],
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

    it("hides groups to which the user does not have assign access", async () => {
        // Remove assign access to the Public Users group
        // @ts-ignore
        accessMap.value[mockGroupDtoPublicUsers._id].group.assign = false;

        const wrapper = mount(GroupSelector, {
            props: {
                groups: [],
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

    it("can filter on groups", async () => {
        const wrapper = mount(GroupSelector, {
            props: {
                groups: [],
            },
        });

        await wrapper.find("input").setValue("edit");

        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Editors");
            expect(wrapper.text()).not.toContain("Public Content");
            expect(wrapper.text()).not.toContain("Super Admins");
        });
    });

    it.skip("Updates the passed array when selecting a group", async () => {
        const groups: string[] = [];
        const wrapper = mount(GroupSelector, {
            props: {
                groups: groups,
                "onUpdate:groups": (e: any) => wrapper.setProps({ groups: e }),
            },
        });

        await wrapper.find("input").setValue("public");

        // Wait for the list to be populated and filtered
        await waitForExpect(() => {
            expect(wrapper.text()).toContain("Public Editors");
        });

        // TODO: Click event is not being triggered
        await wrapper.find("[data-test='group-selector']").trigger("click");

        await waitForExpect(async () => {
            expect(groups).toContain(mockGroupDtoPublicEditors._id);
        });
    });

    it("Updates the passed array when removing a group", async () => {
        const groups: string[] = [mockGroupDtoPublicEditors._id];
        const wrapper = mount(GroupSelector, {
            props: {
                groups: groups,
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
            },
        });

        await waitForExpect(() => {
            expect(wrapper.findComponent(Combobox).props().disabled).toBe(true);
            expect(wrapper.findComponent(LTag).props().disabled).toBe(true);
        });
    });
});
