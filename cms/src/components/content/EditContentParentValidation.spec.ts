import "fake-indexeddb/auto";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import * as mockData from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import EditContentParentValidation from "./EditContentParentValidation.vue";
import waitForExpect from "wait-for-expect";
import { PostType } from "luminary-shared";

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
                tagOrPostType: PostType.Blog,
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                editableParent: {
                    ...mockData.mockPostDto,
                    memberOf: [],
                    imageData: { fileCollections: [], uploadData: [] },
                },
                editableContent: [mockData.mockEnglishContentDto],
                localChange: false,
                existingParent: mockData.mockPostDto,
                existingContent: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canPublish: true,
                canTranslate: true,
                untranslatedLanguages: [],
                canDelete: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("At least one group membership is required");
        });
    });

    it("displays permission message to user", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                tagOrPostType: PostType.Blog,
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                editableParent: {
                    ...mockData.mockPostDto,
                    memberOf: [],
                    imageData: { fileCollections: [], uploadData: [] },
                },
                editableContent: [mockData.mockEnglishContentDto],
                localChange: false,
                existingParent: mockData.mockPostDto,
                existingContent: [mockData.mockEnglishContentDto],
                canEdit: false,
                canTranslateOrPublish: false,
                canPublish: false,
                canTranslate: false,
                untranslatedLanguages: [],
                canDelete: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("No translate permission");
            expect(wrapper.html()).toContain("No edit permission");
            expect(wrapper.html()).toContain("No publish permission");
        });
    });

    // TODO: Test these validations in a different place. https://github.com/bccsa/luminary/issues/313
    it(
        "passes validation by default",
        async () => {
            const wrapper = mount(EditContentParentValidation, {
                props: {
                    tagOrPostType: PostType.Blog,
                    languages: [
                        mockData.mockLanguageDtoEng,
                        mockData.mockLanguageDtoFra,
                        mockData.mockLanguageDtoSwa,
                    ],
                    dirty: true,
                    editableParent: mockData.mockPostDto,
                    editableContent: [mockData.mockEnglishContentDto],
                    localChange: false,
                    existingParent: mockData.mockPostDto,
                    existingContent: [mockData.mockEnglishContentDto],
                    canEdit: true,
                    canTranslateOrPublish: true,
                    canTranslate: true,
                    canPublish: true,
                    untranslatedLanguages: [],
                    canDelete: true,
                },
            });

            await waitForExpect(() => {
                expect(wrapper.html()).not.toContain("At least one group membership is required");
                expect(wrapper.html()).not.toContain("At least one translation is required");
            });
        },
        { timeout: 10000000 },
    );

    it("fails validation if no groups are set", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                tagOrPostType: PostType.Blog,
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                editableParent: { ...mockData.mockPostDto, memberOf: [] },
                editableContent: [],
                localChange: false,
                existingParent: mockData.mockPostDto,
                existingContent: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canTranslate: true,
                canPublish: true,
                untranslatedLanguages: [],
                canDelete: true,
            },
        });

        expect(wrapper.html()).toContain("At least one group membership is required");
    });

    it("fails validation if no translations are set", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                tagOrPostType: PostType.Blog,
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: true,
                editableParent: mockData.mockPostDto,
                editableContent: [],
                localChange: false,
                existingParent: mockData.mockPostDto,
                existingContent: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canTranslate: true,
                canPublish: true,
                untranslatedLanguages: [],
                canDelete: true,
            },
        });

        expect(wrapper.html()).toContain("At least one translation is required");
    });

    it("does not display the offline change warning when there are no local changes", async () => {
        const wrapper = mount(EditContentParentValidation, {
            props: {
                tagOrPostType: PostType.Blog,
                languages: [
                    mockData.mockLanguageDtoEng,
                    mockData.mockLanguageDtoFra,
                    mockData.mockLanguageDtoSwa,
                ],
                dirty: false,
                editableParent: mockData.mockPostDto,
                editableContent: [],
                localChange: false,
                existingParent: mockData.mockPostDto,
                existingContent: [mockData.mockEnglishContentDto],
                canEdit: true,
                canTranslateOrPublish: true,
                canTranslate: true,
                canPublish: true,
                untranslatedLanguages: [],
                canDelete: true,
            },
        });

        expect(wrapper.html()).not.toContain("Offline changes");
    });
});
