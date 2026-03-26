import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import WebAudioPlayer from "./WebAudioPlayer.vue";

vi.mock("@/components/content/AudioPlayer.vue", () => ({
    default: defineComponent({
        name: "MockAudioPlayer",
        inheritAttrs: false,
        props: {
            testProp: { type: String, required: false },
        },
        template: `<div data-testid="mock-audio-player" :data-test-prop="testProp"><slot /></div>`,
    }),
}));

describe("WebAudioPlayer", () => {
    it("renders the underlying AudioPlayer component", () => {
        const wrapper = mount(WebAudioPlayer, { attrs: { testProp: "hello" } });
        expect(wrapper.find('[data-testid="mock-audio-player"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="mock-audio-player"]').attributes("data-test-prop")).toBe(
            "hello",
        );
    });
});

