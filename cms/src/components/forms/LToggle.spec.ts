import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LToggle from "./LToggle.vue";

describe("LToggle", () => {
    it("emits an event on toggle", async () => {
        const wrapper = mount(LToggle, {
            props: { modelValue: false },
        });

        await wrapper.find("svg").trigger("click");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual([true]);
    });
});
