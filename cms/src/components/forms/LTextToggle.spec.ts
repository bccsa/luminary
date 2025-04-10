import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LTextToggle from "./LTextToggle.vue";

describe("LTextToggle", () => {
    it("emits an event on toggle", async () => {
        const wrapper = mount(LTextToggle, {
            props: {
                modelValue: "draft",
                leftValue: "draft",
                rightValue: "published",
                leftLabel: "Draft",
                rightLabel: "Published",
                disabledPublish: false,
            },
        });

        // The labels should be displayed
        expect(wrapper.text()).toContain("Draft");
        expect(wrapper.text()).toContain("Published");

        // It should be able to toggle between the two values
        await wrapper.find('[data-test="text-toggle-right-value"]').trigger("click");
        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual(["published"]);

        await wrapper.find('[data-test="text-toggle-left-value"]').trigger("click");
        expect(wrapper.emitted("update:modelValue")?.length).toBe(2);
        expect(wrapper.emitted("update:modelValue")![1]).toEqual(["draft"]);
    });
});
