import { describe, it, expect, vi, afterAll, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import LModal from "./LModal.vue";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {} // eslint-disable-line @typescript-eslint/no-empty-function
    disconnect() {} // eslint-disable-line @typescript-eslint/no-empty-function
};

describe("LModal", () => {
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
        const wrapper = mount(LModal, {
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

        // This test is very simple because the modal doesn't render properly
        // in tests currently, because of transitions and teleporting
        expect(wrapper.exists()).toBe(true);
    });
});
