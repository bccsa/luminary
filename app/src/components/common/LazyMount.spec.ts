import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import LazyMount from "./LazyMount.vue";

let intersect: IntersectionObserverCallback;
window.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback) {
        intersect = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
} as unknown as typeof IntersectionObserver;

describe("LazyMount", () => {
    it("does not render the slot (or mount its component) until it scrolls near-view", async () => {
        const setupSpy = vi.fn();
        const Child = {
            setup: setupSpy,
            template: "<div>child content</div>",
        };

        const wrapper = mount(LazyMount, {
            slots: { default: () => [h(Child)] },
        });

        expect(wrapper.html()).not.toContain("child content");
        expect(setupSpy).not.toHaveBeenCalled();

        intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as never);
        await wrapper.vm.$nextTick();

        expect(wrapper.html()).toContain("child content");
        expect(setupSpy).toHaveBeenCalledTimes(1);
    });
});
