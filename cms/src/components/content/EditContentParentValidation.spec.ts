import "fake-indexeddb/auto";
import { describe, it, afterEach, beforeEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContentParentValidation from "./EditContentParentValidation.vue";

describe("EditContentParentValidation.vue", () => {
    beforeEach(async () => {
        // seed the fake indexDB with mock datas
        // Set up the Pinia store before each test
        setActivePinia(createTestingPinia());
    });

    afterEach(async () => {});

    it("disables the save button when dirty is false", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: false,
                parent: mockData.mockPostDto,
                contentDocs: [],
                localChange: false,
            },
        });

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("enables the save button when dirty is true", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: mockData.mockPostDto,
                contentDocs: [mockData.mockEnglishContentDto],
                localChange: false,
            },
        });

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeUndefined();
    });

    it("passes validation by default", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: mockData.mockPostDto,
                contentDocs: [mockData.mockEnglishContentDto],
                localChange: false,
            },
        });

        expect(wrapper.html()).not.toContain("At least one group is required");
        expect(wrapper.html()).not.toContain("The default image must be set");
        expect(wrapper.html()).not.toContain("At least one translation is required");

        // Check if the save button is enabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeUndefined();
    });

    it("fails validation if no groups are set", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: { ...mockData.mockPostDto, memberOf: [] },
                contentDocs: [],
                localChange: false,
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
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: false,
                parent: { ...mockData.mockPostDto, image: "" },
                contentDocs: [],
                localChange: false,
            },
        });

        expect(wrapper.html()).toContain("The default image must be set");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("fails validation if no translations are set", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: mockData.mockPostDto,
                contentDocs: [],
                localChange: false,
            },
        });

        expect(wrapper.html()).toContain("At least one translation is required");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("disables the save button when a content document has a validation error", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: mockData.mockPostDto,
                contentDocs: [{ ...mockData.mockEnglishContentDto, title: "" }],
                localChange: false,
            },
        });

        expect(wrapper.html()).toContain("A title is required");

        await wrapper.vm.$nextTick();

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it("displays the offline change warning when there are local changes", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: false,
                parent: mockData.mockPostDto,
                contentDocs: [],
                localChange: true,
            },
        });

        expect(wrapper.html()).toContain("Offline changes");
    });

    it("does not display the offline change warning when there are no local changes", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: false,
                parent: mockData.mockPostDto,
                contentDocs: [],
                localChange: false,
            },
        });

        expect(wrapper.html()).not.toContain("Offline changes");
    });

    it("displays unsaved changes warning when there are changes", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: mockData.mockPostDto,
                contentDocs: [],
                localChange: true,
            },
        });

        expect(wrapper.html()).toContain("Unsaved changes");
    });

    it("doestn't display warning when there are no changes", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: false,
                parent: mockData.mockPostDto,
                contentDocs: [mockData.mockEnglishContentDto],
                localChange: false,
            },
        });

        expect(wrapper.html()).not.toContain("Unsaved changes");
    });
});
