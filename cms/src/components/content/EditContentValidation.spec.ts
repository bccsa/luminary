import { describe, it, afterEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import {
    mockEnglishContentDto,
    mockFrenchContentDto,
    mockLanguageDtoEng,
    mockLanguageDtoFra,
} from "@/tests/mockData";
import EditContentValidation from "./EditContentValidation.vue";

describe("EditContentValidation.vue", () => {
    //

    afterEach(async () => {});

    // TODO: add a test to check if no message errors

    it("don't show validation error if no errors", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockLanguageDtoEng],
                content: mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).toBe("");
    });

    it("show validation error if no title", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockLanguageDtoEng],
                content: { ...mockEnglishContentDto, title: "" },
            },
        });

        expect(wrapper.text()).toContain("A title is required");
    });

    it("show validation error if no slug", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockLanguageDtoEng],
                content: { ...mockEnglishContentDto, slug: "" },
            },
        });

        expect(wrapper.text()).toContain("A slug is required");
    });

    it("show validation error if expiryDate is before publishDate", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockLanguageDtoEng],
                content: {
                    ...mockEnglishContentDto,
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
                languages: [mockLanguageDtoFra],
                content: { ...mockFrenchContentDto, title: "" },
            },
        });

        expect(wrapper.text()).toContain("Français");
    });
});
