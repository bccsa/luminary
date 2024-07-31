import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import EditAclEntry from "./EditAclEntry.vue";
import { AclPermission, DocType } from "luminary-shared";
import { mockGroupDtoPublicContent } from "@/tests/mockdata";

describe("EditAclEntry", () => {
    it("checks if acl entries are disabled when no edit permissions", () => {
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: {
                    type: DocType.Group,
                    groupId: "123",
                    permission: [AclPermission.View],
                },
                disabled: true,
            },
        });

        // Check if the text color is correctly applied
        const th = wrapper.find("th");
        expect(th.classes()).toContain("text-zinc-400");

        // Check if permissionCells are missing the cursor-pointer class
        const permissionCells = wrapper.findAll('[data-test="permissionCell"]');
        permissionCells.forEach((cell) => {
            expect(cell.classes()).not.toContain("cursor-pointer");
        });
    });
});
