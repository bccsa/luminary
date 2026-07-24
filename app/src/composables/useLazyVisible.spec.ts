import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useLazyVisible } from "./useLazyVisible";

let intersect: IntersectionObserverCallback;
function stubIntersectionObserver() {
    window.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) {
            intersect = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof IntersectionObserver;
}

const TestComponent = defineComponent({
    setup() {
        const { root, isVisible } = useLazyVisible("100px");
        return () => h("div", { ref: root }, isVisible.value ? "visible" : "hidden");
    },
});

describe("useLazyVisible", () => {
    it("stays hidden until the observed element intersects", async () => {
        stubIntersectionObserver();
        const wrapper = mount(TestComponent);

        expect(wrapper.text()).toBe("hidden");

        intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as never);
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toBe("visible");
    });

    it("ignores a non-intersecting entry", async () => {
        stubIntersectionObserver();
        const wrapper = mount(TestComponent);

        intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as never);
        await wrapper.vm.$nextTick();

        expect(wrapper.text()).toBe("hidden");
    });
});
