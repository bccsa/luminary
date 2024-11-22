import "fake-indexeddb/auto";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContentParentValidation from "./EditContentParentValidation.vue";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            currentRoute: {
                value: {
                    params: {
                        languageCode: "eng",
                    },
                },
            },
        }),
    };
});

describe("EditContentParentValidation.vue", () => {
    beforeEach(async () => {
        setActivePinia(createTestingPinia());
    });

    it("displays parent validation errors correctly when neccesary", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: {
                    ...mockData.mockPostDto,
                    memberOf: [],
                    imageData: { fileCollections: [], uploadData: [] },
                },
                contentDocs: [mockData.mockEnglishContentDto],
                localChange: false,
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canPublish: true,
                canTranslate: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("The default image must be set");
            expect(wrapper.html()).toContain("At least one group membership is required");
        });
    });

    it("displays permission message to user", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                parent: {
                    ...mockData.mockPostDto,
                    memberOf: [],
                    imageData: { fileCollections: [], uploadData: [] },
                },
                contentDocs: [mockData.mockEnglishContentDto],
                localChange: false,
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: false,
                canTranslateOrPublish: false,
                canPublish: false,
                canTranslate: false,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("No translate permission");
            expect(wrapper.html()).toContain("No edit permission");
            expect(wrapper.html()).toContain("No publish permission");
        });
    });

    // TODO: Test these validations in a different place. https://github.com/bccsa/luminary/issues/313
    it.skip("passes validation by default", async () => {
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
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canTranslate: true,
                canPublish: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("At least one group membership is required");
            expect(wrapper.html()).not.toContain("The default image must be set");
            expect(wrapper.html()).not.toContain("At least one translation is required");

            // Check if the save button is enabled
            const saveButton = wrapper.find('[data-test="save-button"]');
            expect(saveButton.attributes().disabled).toBeUndefined();
        });
    });

    it.skip("fails validation if no groups are set", async () => {
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
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canTranslate: true,
                canPublish: true,
            },
        });

        expect(wrapper.html()).toContain("At least one group membership is required");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it.skip("fails validation if the default image is not set", async () => {
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
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
            },
        });

        expect(wrapper.html()).toContain("The default image must be set");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it.skip("fails validation if no translations are set", async () => {
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
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
            },
        });

        expect(wrapper.html()).toContain("At least one translation is required");

        // Check if the save button is disabled
        const saveButton = wrapper.find('[data-test="save-button"]');
        expect(saveButton.attributes().disabled).toBeDefined();
    });

    it.skip("does not display the offline change warning when there are no local changes", async () => {
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
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
            },
        });

        expect(wrapper.html()).not.toContain("Offline changes");
    });

    it.skip("displays unsaved changes warning when there are changes", async () => {
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
                localChange: true,
                parentPrev: mockData.mockPostDto,
                contentPrev: [],
                canEdit: true,
                canTranslateOrPublish: true,
            },
        });

        expect(wrapper.html()).toContain("Unsaved changes");
    });

    it.skip("doesn't display warning when there are no changes", async () => {
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
                parentPrev: mockData.mockPostDto,
                contentPrev: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
            },
        });

        expect(wrapper.html()).not.toContain("Unsaved changes");
    });
});
