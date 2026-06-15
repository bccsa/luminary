import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ContinueReadingPrompt from "./ContinueReadingPrompt.vue";

describe("ContinueReadingPrompt", () => {
    it("renders when visible and emits continue on action click", async () => {
        const wrapper = mount(ContinueReadingPrompt, {
            props: {
                visible: true,
                progressPercent: 42,
            },
            global: {
                mocks: {
                    t: (key: string) => key,
                },
            },
        });

        expect(wrapper.text()).toContain("content.continueReading.prompt");
        expect(wrapper.text()).toContain("42%");

        await wrapper.get("button").trigger("click");
        expect(wrapper.emitted("continue")).toHaveLength(1);
    });

    it("emits dismiss without emitting continue", async () => {
        const wrapper = mount(ContinueReadingPrompt, {
            props: {
                visible: true,
                progressPercent: 42,
            },
            global: {
                mocks: {
                    t: (key: string) => key,
                },
            },
        });

        const buttons = wrapper.findAll("button");
        await buttons[1].trigger("click");

        expect(wrapper.emitted("dismiss")).toHaveLength(1);
        expect(wrapper.emitted("continue")).toBeUndefined();
    });
});
