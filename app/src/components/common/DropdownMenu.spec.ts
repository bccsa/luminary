import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import DropdownMenu from "./DropdownMenu.vue";
import { nextTick } from "vue";

type Rect = { left: number; right: number; width: number; top: number; bottom: number };

/** jsdom lays nothing out, so the panel/trigger geometry the positioning reads is stubbed. */
const stubRect = (el: HTMLElement, rect: Rect) => {
    el.getBoundingClientRect = () =>
        ({ ...rect, height: rect.bottom - rect.top, x: rect.left, y: rect.top }) as DOMRect;
};

const left = (el: HTMLElement) => Number.parseFloat(el.style.left);

describe("DropdownMenu", () => {
    beforeEach(() => {
        window.innerWidth = 360;
        window.innerHeight = 800;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mountMenu = (props: Record<string, any> = {}) =>
        mount(DropdownMenu, {
            props: { open: false, ...props },
            slots: {
                trigger: "<span>Toggle</span>",
                default: "<div>Menu content</div>",
            },
        });

    it("renders trigger slot", () => {
        const wrapper = mountMenu();
        expect(wrapper.text()).toContain("Toggle");
    });

    it("hides menu panel when closed", () => {
        const wrapper = mountMenu({ open: false });
        const panel = wrapper.find("[role='menu']");
        expect(panel.isVisible()).toBe(false);
    });

    it("shows menu panel when open", () => {
        const wrapper = mountMenu({ open: true });
        const panel = wrapper.find("[role='menu']");
        expect(panel.isVisible()).toBe(true);
    });

    it("toggles open on trigger click", async () => {
        const wrapper = mountMenu();
        const trigger = wrapper.find("[role='button']");

        await trigger.trigger("click");
        expect(wrapper.emitted("update:open")![0]).toEqual([true]);
    });

    it("toggles open on Enter key", async () => {
        const wrapper = mountMenu();
        const trigger = wrapper.find("[role='button']");

        await trigger.trigger("keydown.enter");
        expect(wrapper.emitted("update:open")![0]).toEqual([true]);
    });

    it("toggles open on Space key", async () => {
        const wrapper = mountMenu();
        const trigger = wrapper.find("[role='button']");

        await trigger.trigger("keydown.space");
        expect(wrapper.emitted("update:open")![0]).toEqual([true]);
    });

    it("closes on Escape key when open", async () => {
        const wrapper = mountMenu({ open: true });
        await nextTick();

        // Simulate the requestAnimationFrame callback
        await new Promise((r) => requestAnimationFrame(r));

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await nextTick();

        expect(wrapper.emitted("update:open")).toBeTruthy();
        const lastEmit = wrapper.emitted("update:open")!.pop();
        expect(lastEmit).toEqual([false]);
    });

    it("closes on pointer down outside", async () => {
        const wrapper = mountMenu({ open: true });
        await nextTick();

        // jsdom returns null for offsetParent on detached elements; stub it so
        // the DropdownMenu guard doesn't bail before calling close().
        const root = wrapper.find(".relative").element as HTMLElement;
        Object.defineProperty(root, "offsetParent", {
            get: () => document.body,
            configurable: true,
        });

        document.dispatchEvent(new Event("pointerdown"));
        await nextTick();

        expect(wrapper.emitted("update:open")).toBeTruthy();
        const lastEmit = wrapper.emitted("update:open")!.pop();
        expect(lastEmit).toEqual([false]);
    });

    it("does not close on pointer down inside", async () => {
        const wrapper = mountMenu({ open: true });
        await nextTick();

        const root = wrapper.find(".relative");
        await root.trigger("pointerdown");

        // Should not emit close
        const emits = wrapper.emitted("update:open") || [];
        const closeEmits = emits.filter((e) => e[0] === false);
        expect(closeEmits.length).toBe(0);
    });

    it("applies bottom-start placement origin", () => {
        const wrapper = mountMenu({ open: true, placement: "bottom-start" });
        const panel = wrapper.find("[role='menu']");
        expect(panel.classes()).toContain("origin-top-left");
    });

    it("applies bottom-end placement origin by default", () => {
        const wrapper = mountMenu({ open: true });
        const panel = wrapper.find("[role='menu']");
        expect(panel.classes()).toContain("origin-top-right");
    });

    it("positions the panel as viewport-fixed rather than trigger-absolute", () => {
        const wrapper = mountMenu({ open: true, placement: "bottom-start" });
        const panel = wrapper.find("[role='menu']");
        expect(panel.classes()).toContain("fixed");
        expect(panel.classes()).not.toContain("absolute");
        expect(panel.attributes("style")).toContain("left:");
    });

    it("keeps a wide panel inside the viewport when the trigger sits near the edge", async () => {
        const wrapper = mountMenu({ open: true, placement: "top-start" });
        const panel = wrapper.find("[role='menu']").element as HTMLElement;

        stubRect(wrapper.find("[role='button']").element as HTMLElement, {
            left: 340,
            right: 360,
            width: 20,
            top: 400,
            bottom: 420,
        });
        stubRect(panel, { left: 340, right: 580, width: 240, top: 160, bottom: 400 });
        window.dispatchEvent(new Event("resize"));
        await nextTick();

        // 360px viewport, 240px panel, 8px inset — anchoring to the trigger would put the
        // panel's left edge at 340 and hang 228px off the screen.
        expect(left(panel)).toBe(360 - 240 - 8);
    });

    it("exposes the trigger offset so an arrow can follow a clamped panel", async () => {
        const wrapper = mount(DropdownMenu, {
            props: { open: true, placement: "top-start" },
            slots: {
                trigger: "<span>Toggle</span>",
                default: '<template #default="p"><i>{{ p.triggerOffsetX }}</i></template>',
            },
        });

        stubRect(wrapper.find("[role='button']").element as HTMLElement, {
            left: 340,
            right: 360,
            width: 20,
            top: 400,
            bottom: 420,
        });
        stubRect(wrapper.find("[role='menu']").element as HTMLElement, {
            left: 112,
            right: 352,
            width: 240,
            top: 160,
            bottom: 400,
        });
        window.dispatchEvent(new Event("resize"));
        await nextTick();

        // Trigger centre 350, clamped panel left 112 → the arrow belongs 238px in.
        expect(wrapper.find("i").text()).toBe("238");
    });

    it("sets aria-expanded attribute", () => {
        const wrapper = mountMenu({ open: true });
        const trigger = wrapper.find("[role='button']");
        expect(trigger.attributes("aria-expanded")).toBe("true");
    });

    it("cleans up event listeners on unmount", async () => {
        const removeSpy = vi.spyOn(document, "removeEventListener");
        const wrapper = mountMenu({ open: true });
        await nextTick();

        wrapper.unmount();

        expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
        expect(removeSpy).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    });
});
