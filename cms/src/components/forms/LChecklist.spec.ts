import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import waitForExpect from "wait-for-expect";
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
});
