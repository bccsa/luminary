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

        expect(wrapper.text()).toContain("content.continueReading.action");
        expect(wrapper.text()).not.toContain("42%");
        expect(wrapper.find('[role="progressbar"]').attributes("aria-valuenow")).toBe("42");
        expect(wrapper.find('[style*="width: 42%"]').exists()).toBe(true);

        const continueButton = wrapper.findAll("button")[0];
        await continueButton.trigger("click");
        expect(wrapper.emitted("continue")).toHaveLength(1);
    });

    it("emits dismiss via the X button without emitting continue", async () => {
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

        const dismissButton = wrapper.findAll("button")[1];
        expect(dismissButton.attributes("aria-label")).toBe("content.continueReading.dismiss");

        await dismissButton.trigger("click");

        expect(wrapper.emitted("dismiss")).toHaveLength(1);
        expect(wrapper.emitted("continue")).toBeUndefined();
    });

    it("grows for long translation strings without clipping the action label", () => {
        const longLabel =
            "Continue where you left off in this very long article title that keeps going";

        const wrapper = mount(ContinueReadingPrompt, {
            props: {
                visible: true,
                progressPercent: 75,
            },
            global: {
                mocks: {
                    t: (key: string) =>
                        key === "content.continueReading.action" ? longLabel : key,
                },
            },
        });

        expect(wrapper.text()).toContain(longLabel);
        expect(wrapper.find(".max-w-\\[min\\(24rem\\,calc\\(100vw-2rem\\)\\)\\]").exists()).toBe(
            true,
        );
    });
});
