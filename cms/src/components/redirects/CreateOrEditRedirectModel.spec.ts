import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { fullAccessToAllContentMap, mockRedirectDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import GroupSelector from "../groups/GroupSelector.vue";
import { ComboboxInput } from "@headlessui/vue";

describe("CreateOrEditRedirectModal.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockRedirectDto]);

        setActivePinia(createTestingPinia());

        accessMap.value = fullAccessToAllContentMap;
    });

    afterEach(async () => {
        // Clear the database after each test
        await db.docs.clear();
        await db.localChanges.clear();
    });

    describe("create mode", () => {
        it("can display modal in create mode", async () => {
            const wrapper = mount(CreateOrEditRedirectModal, {
                props: {
                    isVisible: true,
                },
            });

            const inputRedirectName = wrapper.find("[name='RedirectFromSlug']")
                .element as HTMLInputElement;

            expect(wrapper.html()).toContain("Create New Redirect");
            expect(inputRedirectName.value).toBe("");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Create");
        });

        it.skip("can enable save button if form fields are filled", async () => {
            const wrapper = mount(CreateOrEditRedirectModal, {
                props: {
                    isVisible: true,
                },
            });

            await wrapper.find("[name='redirectName']").setValue("Afrikaans");
            await wrapper.find("[name='redirectCode']").setValue("afr");

            let groupSelector: any;
            await waitForExpect(() => {
                groupSelector = wrapper.findComponent(GroupSelector);
                expect(groupSelector.exists()).toBe(true);
            });

            await groupSelector!.findComponent(ComboboxInput).setValue("Redirects");

            // Assert that the save button is disabled
            const saveButton = wrapper.find("[data-test='save-button']");
            expect(saveButton.attributes("disabled")).toBeDefined();
        });
    });

    describe("edit mode", () => {
        it("can display the modal in edit mode", async () => {
            const wrapper = mount(CreateOrEditRedirectModal, {
                props: {
                    isVisible: true,
                    redirect: mockRedirectDto,
                },
            });

            const inputRedirectName = wrapper.find("[name='RedirectFromSlug']")
                .element as HTMLInputElement;

            expect(wrapper.html()).toContain("Edit Redirect");
            expect(inputRedirectName.value).toBe("vod");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Save Changes");
        });
    });

    it.skip("disables save button if form fields are not filled", async () => {
        const wrapper = mount(CreateOrEditRedirectModal, {
            props: {
                isVisible: true,
            },
        });

        // Clear the input fields to simulate an empty form
        await wrapper.find("[name='redirectName']").setValue("");
        await wrapper.find("[name='redirectCode']").setValue("");

        // Assert that the save button is disabled
        const saveButton = wrapper.find("[data-test='save-button']");
        expect(saveButton.attributes("disabled")).toBeUndefined();
    });

    it("emits close event when cancel button is clicked", async () => {
        const wrapper = mount(CreateOrEditRedirectModal, {
            props: {
                isVisible: true,
            },
        });

        await wrapper.find("[data-test='cancel']").trigger("click");

        // Assert the close event was emitted
        expect(wrapper.emitted().close).toBeTruthy();
    });
});
