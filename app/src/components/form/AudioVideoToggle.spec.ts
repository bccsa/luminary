import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AudioVideoToggle from "./AudioVideoToggle.vue";

describe("AudioVideoToggle", () => {
    it("emits an event on toggle", async () => {
        const wrapper = mount(AudioVideoToggle, {
            props: { modelValue: false },
        });

        await wrapper.find("svg").trigger("click");

        expect(wrapper.emitted("update:modelValue")?.length).toBe(1);
        expect(wrapper.emitted("update:modelValue")![0]).toEqual([true]);
    });
});
