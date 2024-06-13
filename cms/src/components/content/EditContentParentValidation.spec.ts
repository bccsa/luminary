import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import {
    mockEnglishContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
    mockLanguageDtoSwa,
    mockPostDto,
} from "@/tests/mockData";
import { setActivePinia } from "pinia";
import EditContentParentValidation from "./EditContentParentValidation.vue";

describe("EditContent.vue", () => {
    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {});

    it("disables the save button when dirty is false", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa],
                dirty: false,
                parent: mockPostDto,
                contentDocs: [],
            },
        });

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("enables the save button when dirty is true", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa],
                dirty: true,
                parent: mockPostDto,
                contentDocs: [],
            },
        });

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeUndefined();
    });

    it("passes validation by default", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa],
                dirty: true,
                parent: mockPostDto,
                contentDocs: [],
            },
        });

        expect(wrapper.html()).not.toContain("At least one group is required");
        expect(wrapper.html()).not.toContain("The default image must be set");

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeUndefined();
    });

    it("fails validation if no groups are set", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa],
                dirty: true,
                parent: { ...mockPostDto, memberOf: [] },
                contentDocs: [],
            },
        });

        expect(wrapper.html()).toContain("At least one group is required");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("fails validation if the default image is not set", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa],
                dirty: false,
                parent: { ...mockPostDto, image: "" },
                contentDocs: [],
            },
        });

        expect(wrapper.html()).toContain("The default image must be set");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("disables the save button when a content document has a validation error", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa],
                dirty: true,
                parent: mockPostDto,
                contentDocs: [{ ...mockEnglishContentDto, title: "" }],
            },
        });

        expect(wrapper.html()).toContain("A title is required");

        await wrapper.vm.$nextTick();

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });
});
