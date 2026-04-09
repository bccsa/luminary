import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import DropdownMenu from "./DropdownMenu.vue";
import { nextTick } from "vue";

describe("DropdownMenu", () => {
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

    it("applies bottom-start placement classes", () => {
        const wrapper = mountMenu({ open: true, placement: "bottom-start" });
        const panel = wrapper.find("[role='menu']");
        expect(panel.classes()).toContain("left-0");
        expect(panel.classes()).toContain("origin-top-left");
    });

    it("applies bottom-end placement classes by default", () => {
        const wrapper = mountMenu({ open: true });
        const panel = wrapper.find("[role='menu']");
        expect(panel.classes()).toContain("right-0");
        expect(panel.classes()).toContain("origin-top-right");
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
