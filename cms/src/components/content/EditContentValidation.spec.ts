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

// const routePushMock = vi.fn();

// vi.mock("vue-router", async (importOriginal) => {
//     const actual = await importOriginal();
//     return {
//         // @ts-expect-error
//         ...actual,
//         useRouter: () => ({
//             push: routePushMock,
//         }),
//     };
// });

describe("EditContentValidation.vue", () => {
    it("don't show validation error if no errors", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                content: mockData.mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).not.toContain("There are some errors that prevent saving");
    });

    it("show validation error if no title", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                content: { ...mockData.mockEnglishContentDto, title: "" },
            },
        });

        expect(wrapper.text()).toContain("A title is required");
    });

    it("show validation error if no slug", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                content: { ...mockData.mockEnglishContentDto, slug: "" },
            },
        });

        expect(wrapper.text()).toContain("A slug is required");
    });

    it("show validation error if expiryDate is before publishDate", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                content: {
                    ...mockData.mockEnglishContentDto,
                    publishDate: 1704114000000,
                    expiryDate: 1604114000000,
                },
            },
        });

        expect(wrapper.text()).toContain("The expiry date must be after the publish date");
    });

    it("show the correct language name", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoFra],
                content: { ...mockData.mockFrenchContentDto, title: "" },
            },
        });

        expect(wrapper.text()).toContain("Français");
    });

    describe("Content status", () => {
        it("show published status", async () => {
            const wrapper = mount(EditContentValidation, {
                props: {
                    languages: [mockData.mockLanguageDtoFra],
                    content: mockData.mockFrenchContentDto,
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
                    content: { ...mockData.mockSwahiliContentDto, expiryDate: Date.now() - 1 },
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
                    content: {
                        ...mockData.mockEnglishContentDto,
                        publishDate: Date.now() + 100000,
                    },
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
                    content: { ...mockData.mockEnglishContentDto, status: PublishStatus.Draft },
                },
            });

            await waitForExpect(() => {
                expect(wrapper.text()).toContain("English");
                expect(wrapper.text()).toContain("Draft");
            });
        });
    });
});
