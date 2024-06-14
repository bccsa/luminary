import { describe, it, afterEach, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { mockEnglishContentDto, mockLanguageDtoEng } from "@/tests/mockData";
import EditContentValidation from "./EditContentValidation.vue";

describe("EditContentValidation.vue", () => {
    //

    afterEach(async () => {});

    // TODO: add a test to check if no message errors

    it("show validation error if no title", async () => {
        const wrapper = mount(EditContentValidation, {
            props: {
                languages: [mockLanguageDtoEng],
                content: { ...mockEnglishContentDto, title: "" },
            },
        });

        expect(wrapper.text()).toContain("A title is required");
    });
});
