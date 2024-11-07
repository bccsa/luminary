import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import CreateOrEditRedirectModal from "./CreateOrEditRedirectModal.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { accessMap, db } from "luminary-shared";
import { mockRedirectDto, superAdminAccessMap } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import GroupSelector from "../groups/GroupSelector.vue";
import LButton from "../button/LButton.vue";

describe("CreateOrEditRedirectModal.vue", () => {
    beforeEach(async () => {
        await db.docs.bulkPut([mockRedirectDto]);

        setActivePinia(createTestingPinia());

        accessMap.value = superAdminAccessMap;
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

            expect(wrapper.html()).toContain("Create new redirect");
            expect(inputRedirectName.value).toBe("");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Create");
        });

        it("can enable save button if form fields are filled", async () => {
            const wrapper = mount(CreateOrEditRedirectModal, {
                props: {
                    isVisible: true,
                    redirect: { ...mockRedirectDto },
                },
            });

            await wrapper.find("[name='RedirectFromSlug']").setValue("Afrikaans");
            await wrapper.find("[name='RedirectToSlug']").setValue("afr");

            let groupSelector: any;
            await waitForExpect(() => {
                groupSelector = wrapper.findComponent(GroupSelector);
                expect(groupSelector.exists()).toBe(true);
            });

            // Assert that the save button is enabled
            const saveButton = wrapper.findAllComponents(LButton).at(3);
            expect(saveButton!.props("disabled")).toBe(false);
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

            expect(wrapper.html()).toContain("Edit");
            expect(inputRedirectName.value).toBe("vod");

            // check if the button has the right text
            expect(wrapper.html()).toContain("Save");
        });
    });

    it("disables save button if form fields are not filled", async () => {
        const wrapper = mount(CreateOrEditRedirectModal, {
            props: {
                isVisible: true,
            },
        });

        // Clear the input fields to simulate an empty form
        await wrapper.find("[name='RedirectFromSlug']").setValue("");
        await wrapper.find("[name='RedirectToSlug']").setValue("");

        // Assert that the save button is disabled
        const saveButton = wrapper.findAllComponents(LButton).at(3);
        expect(saveButton!.props("disabled")).toBe(true);
    });

    it("disables save button if no group is set", async () => {
        const wrapper = mount(CreateOrEditRedirectModal, {
            props: {
                isVisible: true,
            },
        });

        // The default redirect modal has no groups set if no RedirectDto is passed to the modal
        // Assert that the save button is disabled
        const saveButton = wrapper.findAllComponents(LButton).at(3);
        expect(saveButton?.props("disabled")).toBe(true);
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
