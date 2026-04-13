import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { DocType, type AuthProviderGroupMapping, type GroupDto } from "luminary-shared";
import GroupMappings from "./GroupMappings.vue";

const mockGroups: GroupDto[] = [
    {
        _id: "group-editors",
        type: DocType.Group,
        name: "Editors",
        updatedTimeUtc: 1704114000000,
        memberOf: ["group-editors"],
        acl: [],
    },
    {
        _id: "group-admins",
        type: DocType.Group,
        name: "Admins",
        updatedTimeUtc: 1704114000000,
        memberOf: ["group-admins"],
        acl: [],
    },
];

const claimEqualsMapping: AuthProviderGroupMapping = {
    groupId: "group-editors",
    conditions: [{ type: "claimEquals", claimPath: "role", value: "editor" }],
};

const claimInMapping: AuthProviderGroupMapping = {
    groupId: "group-admins",
    conditions: [{ type: "claimIn", claimPath: "roles", values: ["admin", "superadmin"] }],
};

describe("GroupMappings.vue", () => {
    // ── Empty state ───────────────────────────────────────────────────────────

    it("shows empty state text when there are no mappings", () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [], availableGroups: mockGroups },
        });

        expect(wrapper.html()).toContain("No rules yet");
    });

    it("hides empty state text when mappings exist", () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [claimEqualsMapping], availableGroups: mockGroups },
        });

        expect(wrapper.html()).not.toContain("No rules yet");
    });

    // ── Add mapping ───────────────────────────────────────────────────────────

    it("emits 'update:modelValue' with a new empty mapping when '+ Add Rule' is clicked", async () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [], availableGroups: mockGroups },
        });

        await wrapper.find("button").trigger("click"); // "+ Add Rule" is the first button

        const emitted = wrapper.emitted("update:modelValue");
        expect(emitted).toBeDefined();
        const newList = emitted![0][0] as AuthProviderGroupMapping[];
        expect(newList).toHaveLength(1);
        expect(newList[0].groupId).toBe("");
        expect(newList[0].conditions).toEqual([]);
    });

    // ── Remove mapping ────────────────────────────────────────────────────────

    it("emits 'update:modelValue' with the mapping removed when the trash button is clicked", async () => {
        const wrapper = mount(GroupMappings, {
            props: {
                modelValue: [claimEqualsMapping, claimInMapping],
                availableGroups: mockGroups,
            },
        });

        // Each mapping card has one trash button (aria-label="Remove rule")
        const removeButtons = wrapper.findAll("[aria-label='Remove rule']");
        expect(removeButtons).toHaveLength(2);

        await removeButtons[0].trigger("click");

        const emitted = wrapper.emitted("update:modelValue");
        expect(emitted).toBeDefined();
        const newList = emitted![0][0] as AuthProviderGroupMapping[];
        expect(newList).toHaveLength(1);
        expect(newList[0].groupId).toBe("group-admins");
    });

    // ── Condition summaries ───────────────────────────────────────────────────

    it("shows 'Assigned to all authenticated users' when mapping has no extra conditions", () => {
        const noConditionMapping: AuthProviderGroupMapping = {
            groupId: "group-editors",
            conditions: [],
        };
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [noConditionMapping], availableGroups: mockGroups },
        });

        expect(wrapper.html()).toContain("Assigned to all authenticated users");
    });

    it("shows claimEquals condition summary in view mode", () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [claimEqualsMapping], availableGroups: mockGroups },
        });

        // Should contain claim path, operator and value
        expect(wrapper.html()).toContain("role");
        expect(wrapper.html()).toContain("editor");
    });

    it("shows claimIn condition summary in view mode", () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [claimInMapping], availableGroups: mockGroups },
        });

        expect(wrapper.html()).toContain("roles");
        expect(wrapper.html()).toContain("admin");
    });

    // ── Add condition ─────────────────────────────────────────────────────────

    it("emits 'update:modelValue' with a new claimEquals condition when '+ Add Condition' is clicked", async () => {
        const emptyMapping: AuthProviderGroupMapping = { groupId: "", conditions: [] };
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [emptyMapping], availableGroups: mockGroups },
        });

        const addConditionBtn = wrapper
            .findAll("button")
            .find((b) => b.text().includes("Add Condition"));
        expect(addConditionBtn).toBeDefined();
        await addConditionBtn!.trigger("click");

        const emitted = wrapper.emitted("update:modelValue");
        expect(emitted).toBeDefined();
        const newList = emitted![0][0] as AuthProviderGroupMapping[];
        expect(newList[0].conditions).toHaveLength(1);
        expect(newList[0].conditions[0].type).toBe("claimEquals");
    });

    // ── Remove condition ──────────────────────────────────────────────────────

    it("emits 'update:modelValue' with the condition removed when remove-condition is clicked", async () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [claimEqualsMapping], availableGroups: mockGroups },
        });

        const removeCondBtn = wrapper.find("[aria-label='Remove condition']");
        await removeCondBtn.trigger("click");

        const emitted = wrapper.emitted("update:modelValue");
        expect(emitted).toBeDefined();
        const newList = emitted![0][0] as AuthProviderGroupMapping[];
        expect(newList[0].conditions).toHaveLength(0);
    });

    // ── Disabled state ────────────────────────────────────────────────────────

    it("disables '+ Add Rule' when disabled prop is true", () => {
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [], availableGroups: mockGroups, disabled: true },
        });

        const addRuleBtn = wrapper.find("button");
        expect((addRuleBtn.element as HTMLButtonElement).disabled).toBe(true);
    });

    it("disables '+ Add Condition' and the remove-rule button when disabled prop is true", () => {
        const emptyMapping: AuthProviderGroupMapping = { groupId: "", conditions: [] };
        const wrapper = mount(GroupMappings, {
            props: { modelValue: [emptyMapping], availableGroups: mockGroups, disabled: true },
        });

        const addConditionBtn = wrapper.findAll("button").find((b) => b.text().includes("Add Condition"));
        expect(addConditionBtn).toBeDefined();
        expect((addConditionBtn!.element as HTMLButtonElement).disabled).toBe(true);

        const removeRuleBtn = wrapper.find("[aria-label='Remove rule']");
        expect((removeRuleBtn.element as HTMLButtonElement).disabled).toBe(true);
    });
});
