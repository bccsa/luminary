import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import EditAclEntry from "./EditAclEntry.vue";
import { AclPermission, DocType } from "luminary-shared";
import { mockGroupDtoPublicContent } from "@/tests/mockdata";

vi.mock("@/globalConfig", async (importOriginal) => {
    const { ref } = await import("vue");
    const actual = await importOriginal();
    return {
        ...(actual as any),
        isMobileScreen: ref(false),
        isSmallScreen: ref(false),
    };
});

describe("EditAclEntry", () => {
    it("displays the active permissions correctly", () => {
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
        expect(permissionCells[0].text()).toBe("View");
    });

    it("displays the doc type name", () => {
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: {
                    type: DocType.Post,
                    groupId: "123",
                    permission: [AclPermission.View, AclPermission.Edit],
                },
                disabled: false,
            },
        });

        expect(wrapper.text()).toContain("Post");
    });

    it("shows multiple active permissions", () => {
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: {
                    type: DocType.Post,
                    groupId: "123",
                    permission: [AclPermission.View, AclPermission.Edit, AclPermission.Translate],
                },
                disabled: false,
            },
        });

        const permissionCells = wrapper.findAll('[data-test="active-permissions"]');
        expect(permissionCells.length).toBe(3);
    });

    it("shows no active permissions when permission array is empty", () => {
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: {
                    type: DocType.Group,
                    groupId: "123",
                    permission: [],
                },
                disabled: false,
            },
        });

        const permissionCells = wrapper.findAll('[data-test="active-permissions"]');
        expect(permissionCells.length).toBe(0);
    });

    it("renders nothing when aclEntry is undefined", () => {
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: undefined as any,
                disabled: false,
            },
        });

        // The v-if="aclEntry" should prevent rendering the inner content
        expect(wrapper.find('[data-test="active-permissions"]').exists()).toBe(false);
    });

    it("only shows permissions available for the doc type", () => {
        // User DocType only has View, Edit, Delete - no Assign, Translate, Publish
        const wrapper = mount(EditAclEntry, {
            props: {
                originalGroup: mockGroupDtoPublicContent,
                aclEntry: {
                    type: DocType.User,
                    groupId: "123",
                    permission: [AclPermission.View, AclPermission.Edit],
                },
                disabled: false,
            },
        });

        const permissionCells = wrapper.findAll('[data-test="active-permissions"]');
        expect(permissionCells.length).toBe(2);
        const texts = permissionCells.map((c) => c.text());
        expect(texts).toContain("View");
        expect(texts).toContain("Edit");
    });
});
