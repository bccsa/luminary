import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import LDialog from "./LDialog.vue";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

describe("LDialog", () => {
    beforeAll(() => {
        vi.spyOn(window, "requestAnimationFrame").mockImplementation(setImmediate as any);
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation(clearImmediate as any);
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("renders a modal", async () => {
        const primaryAction = vi.fn();
        const secondaryAction = vi.fn();
        const wrapper = mount(LDialog, {
            props: {
                open: true,
                title: "Are you sure?",
                description: "I wouldn't do that if I were you.",
                primaryButtonText: "I still will",
                secondaryButtonText: "Ok then",
                primaryAction,
                secondaryAction,
            },
        });

        expect(wrapper.exists()).toBe(true);
        expect(wrapper.text()).toContain("Are you sure?");
        expect(wrapper.text()).toContain("I wouldn't do that if I were you.");
        expect(wrapper.text()).toContain("I still will");
        expect(wrapper.text()).toContain("Ok then");
    });
});
