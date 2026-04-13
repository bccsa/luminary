import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { isConnected } from "luminary-shared";
import FormActions from "./FormActions.vue";

const baseProps = {
    isEditing: false,
    isLoading: false,
    canDelete: false,
    isFormValid: true,
    isDirty: true,
};

describe("FormActions.vue", () => {
    beforeEach(() => {
        isConnected.value = true;
    });

    afterEach(() => {
        isConnected.value = true;
    });

    // ── Button label ─────────────────────────────────────────────────────────

    it("shows 'Save' as the save button label", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: false },
        });

        expect(wrapper.html()).toContain("Save");
    });

    // ── Delete button ─────────────────────────────────────────────────────────

    it("hides Delete button when not editing", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: false, canDelete: true },
        });

        expect(wrapper.html()).not.toContain("Delete");
    });

    it("hides Delete button when canDelete is false", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, canDelete: false },
        });

        expect(wrapper.html()).not.toContain("Delete");
    });

    it("shows Delete button when editing and canDelete is true", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, canDelete: true },
        });

        expect(wrapper.html()).toContain("Delete");
    });

    // ── Revert button ─────────────────────────────────────────────────────────

    it("hides Revert button when not editing", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: false, isDirty: true },
        });

        expect(wrapper.html()).not.toContain("Revert");
    });

    it("hides Revert button when not dirty", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, isDirty: false },
        });

        expect(wrapper.html()).not.toContain("Revert");
    });

    it("shows Revert button when editing and dirty", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, isDirty: true },
        });

        expect(wrapper.html()).toContain("Revert");
    });

    // ── Unsaved changes badge ─────────────────────────────────────────────────

    it("shows 'Unsaved changes' badge when editing and dirty", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, isDirty: true },
        });

        expect(wrapper.html()).toContain("Unsaved changes");
    });

    it("hides 'Unsaved changes' badge when not editing", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: false, isDirty: true },
        });

        expect(wrapper.html()).not.toContain("Unsaved changes");
    });

    // ── Offline warning ───────────────────────────────────────────────────────

    it("shows offline warning when not connected", () => {
        isConnected.value = false;
        const wrapper = mount(FormActions, {
            props: baseProps,
        });

        expect(wrapper.html()).toContain("offline");
    });

    it("does not show offline warning when connected", () => {
        isConnected.value = true;
        const wrapper = mount(FormActions, {
            props: baseProps,
        });

        expect(wrapper.html()).not.toContain("offline");
    });

    // ── Save button disabled states ───────────────────────────────────────────

    it("disables save button when form is invalid", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isFormValid: false, isDirty: true },
        });

        const saveBtn = wrapper.findAll("button").find((b) => b.text().includes("Save"));
        expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(true);
    });

    it("disables save button when not dirty", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isFormValid: true, isDirty: false },
        });

        const saveBtn = wrapper.findAll("button").find((b) => b.text().includes("Save"));
        expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(true);
    });

    it("disables save button when offline", () => {
        isConnected.value = false;
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isFormValid: true, isDirty: true },
        });

        const saveBtn = wrapper.findAll("button").find((b) => b.text().includes("Save"));
        expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(true);
    });

    it("enables save button when form is valid, dirty, and online", () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isFormValid: true, isDirty: true },
        });

        const saveBtn = wrapper.findAll("button").find((b) => b.text().includes("Save"));
        expect((saveBtn!.element as HTMLButtonElement).disabled).toBe(false);
    });

    // ── Emitted events ────────────────────────────────────────────────────────

    it("emits 'save' when the save button is clicked", async () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isFormValid: true, isDirty: true },
        });

        const saveBtn = wrapper.findAll("button").find((b) => b.text().includes("Save"));
        await saveBtn!.trigger("click");

        expect(wrapper.emitted("save")).toHaveLength(1);
    });

    it("emits 'close' when Cancel is clicked", async () => {
        const wrapper = mount(FormActions, { props: baseProps });

        const cancelBtn = wrapper.findAll("button").find((b) => b.text() === "Cancel");
        await cancelBtn!.trigger("click");

        expect(wrapper.emitted("close")).toHaveLength(1);
    });

    it("emits 'delete' when Delete is clicked", async () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, canDelete: true },
        });

        const deleteBtn = wrapper.findAll("button").find((b) => b.text() === "Delete");
        await deleteBtn!.trigger("click");

        expect(wrapper.emitted("delete")).toHaveLength(1);
    });

    it("emits 'revert' when Revert is clicked", async () => {
        const wrapper = mount(FormActions, {
            props: { ...baseProps, isEditing: true, isDirty: true },
        });

        const revertBtn = wrapper.findAll("button").find((b) => b.text().includes("Revert"));
        await revertBtn!.trigger("click");

        expect(wrapper.emitted("revert")).toHaveLength(1);
    });
});
