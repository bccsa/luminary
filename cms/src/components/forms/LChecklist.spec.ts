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

        const mainDiv = wrapper.find("[data-test='main-div']");

        mainDiv.trigger("click");

        await wrapper.vm.$nextTick();

        const optionsDiv = wrapper.find("[data-test='options-div']");
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
                modelValue: [],
            },
        });

        // Click to show options
        const mainDiv = wrapper.find("[data-test='main-div']");
        await mainDiv.trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.selectedValues).toEqual([]);
        expect(wrapper.vm.givenOptions[0].isChecked).toBe(false);
        expect(wrapper.vm.givenOptions[1].isChecked).toBe(false);

        const option1 = wrapper.find("input#tag1");
        await option1.trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.selectedValues).toEqual([
            { value: "tag1", label: "tag1", isChecked: true },
        ]);
        expect(wrapper.vm.givenOptions[0].isChecked).toBe(true);
        expect(wrapper.vm.givenOptions[1].isChecked).toBe(false);

        const option2 = wrapper.find("input#tag2");
        await option2.trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.selectedValues).toEqual([
            { value: "tag1", label: "tag1", isChecked: true },
            { value: "tag2", label: "tag2", isChecked: true },
        ]);
        expect(wrapper.vm.givenOptions[0].isChecked).toBe(true);
        expect(wrapper.vm.givenOptions[1].isChecked).toBe(true);

        await option1.trigger("click");
        await wrapper.vm.$nextTick();

        expect(wrapper.vm.selectedValues).toEqual([
            { value: "tag2", label: "tag2", isChecked: true },
        ]);
        expect(wrapper.vm.givenOptions[0].isChecked).toBe(false);
        expect(wrapper.vm.givenOptions[1].isChecked).toBe(true);
    });
});
