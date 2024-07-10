import "fake-indexeddb/auto";
import { describe, it, afterEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import * as mockData from "@/mockdata";
import EditContentValidation from "./EditContentValidation.vue";

describe("EditContentValidation.vue", () => {
    //

    afterEach(async () => {});

    // TODO: add a test to check if no message errors

    it("don't show validation error if no errors", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockData.mockLanguageDtoEng],
                content: mockData.mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).toBe("");
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
});
