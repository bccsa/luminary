//@ts-nocheck --> To prevent wrapper.vm.givenOptions typing error as it is valid code - block level ignore doesn't work so this is the best solution for that.

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import LChecklist from "./LChecklist.vue";

describe("LChecklist", () => {
    it("displays options div when triggered", async () => {
        const options = [
            { value: "tag1", label: "tag1", isChecked: false },
            { value: "tag2", label: "tag2", isChecked: false },
        ];
        const wrapper = mount(LChecklist, {
            props: {
                options: options,
            },
        });

        const input = wrapper.find("[data-test='input']");

        input.trigger("focus");

        await wrapper.vm.$nextTick();

        const optionsDiv = wrapper.find("[data-test='options']");
        expect(optionsDiv.exists()).toBe(true);
    });
    it("sends selected options to the parent", async () => {
        const options = [
            { value: "tag1", label: "tag1", isChecked: false },
            { value: "tag2", label: "tag2", isChecked: false },
        ];
        const wrapper = mount(LChecklist, {
            props: {
                options,
                selectedValues: [],
            },
        });

        const input = wrapper.find("[data-test='input']");
        await input.trigger("focus");
        await wrapper.vm.$nextTick();

        const optionsContainer = wrapper.find("[data-test='options']");

        const selectables = optionsContainer.findAll("[data-test='option']");
        await selectables[0].trigger("click");

        expect(wrapper.vm.selectedValues).toContain("tag1");
    });
});
