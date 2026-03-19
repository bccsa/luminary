import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import EditAclEntry from "./EditAclEntry.vue";
import { AclPermission, DocType } from "luminary-shared";
import { mockGroupDtoPublicContent } from "@/tests/mockdata";

describe("EditAclEntry", () => {
    it("displays the actives permissions correctly", () => {
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: {
                    type: DocType.Group,
                    groupId: "123",
                    permission: [AclPermission.View],
                },
                disabled: false,
            },
        });

        const permissionCells = wrapper.findAll('[data-test="active-permissions"]');
        expect(permissionCells.length).toBeGreaterThan(0);
    });
});
