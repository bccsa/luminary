import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/tests/mockdata";
import EditContentValidation from "./EditContentValidation.vue";
import { PublishStatus } from "luminary-shared";
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

describe("EditContentValidation.vue", () => {
    it("show validation error if no title", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                editableContent: { ...mockData.mockEnglishContentDto, title: "" },
                canDelete: true,
            },
        });

        expect(wrapper.text()).toContain("A title is required");
    });

    it("show validation error if no slug", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                editableContent: { ...mockData.mockEnglishContentDto, slug: "" },
                canDelete: true,
            },
        });

        expect(wrapper.text()).toContain("A slug is required");
    });

    it("show validation error if expiryDate is before publishDate", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                editableContent: {
                    ...mockData.mockEnglishContentDto,
                    publishDate: 1704114000000,
                    expiryDate: 1604114000000,
                },
                canDelete: true,
            },
        });

        expect(wrapper.text()).toContain("The expiry date must be after the publish date");
    });

    it("show the correct language name", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoFra],
                editableContent: { ...mockData.mockFrenchContentDto, title: "" },
                canDelete: true,
            },
        });

        expect(wrapper.text()).toContain("Français");
    });

    describe("Content status", () => {
        it("show published status", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoFra],
                    editableContent: mockData.mockFrenchContentDto,
                    canDelete: true,
                },
            });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("Français");
                expect(wrapper.text()).toContain("Published");
            });
        });

        it("shows expired status", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoSwa],
                    editableContent: {
                        ...mockData.mockSwahiliContentDto,
                        expiryDate: Date.now() - 1,
                    },
                    canDelete: true,
                },
            });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("Swahili");
                expect(wrapper.text()).toContain("Expired");
            });
        });

        it("shows scheduled status", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoEng],
                    editableContent: {
                        ...mockData.mockEnglishContentDto,
                        publishDate: Date.now() + 100000,
                    },
                    canDelete: true,
                },
            });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("English");
                expect(wrapper.text()).toContain("Scheduled");
            });
        });

        it("shows draft status", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoEng],
                    editableContent: {
                        ...mockData.mockEnglishContentDto,
                        status: PublishStatus.Draft,
                    },
                    canDelete: true,
                },
            });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("English");
                expect(wrapper.text()).toContain("Draft");
            });
        });

        it("shows the old and new status when it changes", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoEng],
                    editableContent: {
                        ...mockData.mockEnglishContentDto,
                        status: PublishStatus.Draft,
                    },
                    existingContent: {
                        ...mockData.mockCategoryContentDto,
                        status: PublishStatus.Published,
                    },
                    canDelete: true,
                },
            });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("English");
                expect(wrapper.text()).toContain("Published");
                expect(wrapper.text()).toContain("Draft");
            });
        });

        it("Hides the delete button when a user does not have delete access", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoEng],
                    existingContent: {
                        ...mockData.mockEnglishContentDto,
                        status: PublishStatus.Published,
                    },
                    canDelete: false,
                },
            });

            await waitForExpect(async () => {
                const deletebutton = wrapper.find('[data-test="translation-delete-button"]');
                expect(deletebutton.exists()).toBe(false);
            });
        });
    });
});
