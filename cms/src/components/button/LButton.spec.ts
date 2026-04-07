import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import LButton from "./LButton.vue";
import { DocumentPlusIcon } from "@heroicons/vue/24/outline";

describe("LButton", () => {
    it("renders the default slot and icon", async () => {
        const wrapper = mount(LButton, {
            props: { icon: DocumentPlusIcon },
            slots: { default: "Button text" },
        });

        expect(wrapper.text()).toBe("Button text");
        expect(wrapper.findComponent(DocumentPlusIcon).exists()).toBe(true);
    });

    it("can be a button or anchor element", async () => {
        const wrapper = mount(LButton);
        expect(wrapper.html()).toContain("<button");

        await wrapper.setProps({ is: "a" });

        expect(wrapper.html()).toContain("<a");
    });

    it("renders segmented button with left/right slots", () => {
        const wrapper = mount(LButton, {
            slots: {
                left: "Left",
                default: "Main",
                right: "Right",
            },
        });

        expect(wrapper.text()).toContain("Left");
        expect(wrapper.text()).toContain("Main");
        expect(wrapper.text()).toContain("Right");
        expect(wrapper.find('[role="group"]').exists()).toBe(true);
    });

    it("emits main-click when main segment is clicked", async () => {
        const wrapper = mount(LButton, {
            props: { segmented: true },
            slots: {
                default: "Main",
                right: "Right",
            },
        });

        const buttons = wrapper.findAll("button");
        // Main segment button
        await buttons[0].trigger("click");

        expect(wrapper.emitted("main-click")).toBeDefined();
    });

    it("emits right-click when right segment is clicked without rightAction", async () => {
        const wrapper = mount(LButton, {
            props: { segmented: true },
            slots: {
                default: "Main",
                right: "Right",
            },
        });

        const buttons = wrapper.findAll("button");
        // Right segment button is the last one
        await buttons[buttons.length - 1].trigger("click");

        expect(wrapper.emitted("right-click")).toBeDefined();
    });

    it("calls rightAction on right segment click with dropdownAnchor", async () => {
        const rightAction = vi.fn();
        const wrapper = mount(LButton, {
            props: { segmented: true, dropdownAnchor: true, rightAction },
            slots: {
                default: "Main",
                right: "Right",
            },
        });

        // dropdownAnchor makes right segment a div, find it
        const rightSegment = wrapper.find('[role="button"]');
        if (rightSegment.exists()) {
            await rightSegment.trigger("click");
        }

        expect(rightAction).toHaveBeenCalled();
    });

    it("does not emit when disabled", async () => {
        const wrapper = mount(LButton, {
            props: { segmented: true, disabled: true },
            slots: {
                default: "Main",
                right: "Right",
            },
        });

        const buttons = wrapper.findAll("button");
        await buttons[0].trigger("click");

        expect(wrapper.emitted("main-click")).toBeUndefined();
    });

    it("calls mainAction when provided", async () => {
        const mainAction = vi.fn();
        const wrapper = mount(LButton, {
            props: { segmented: true, mainAction },
            slots: {
                default: "Main",
                right: "Right",
            },
        });

        const buttons = wrapper.findAll("button");
        await buttons[0].trigger("click");

        expect(mainAction).toHaveBeenCalled();
    });

    it("renders tooltip slot", () => {
        const wrapper = mount(LButton, {
            slots: {
                default: "Hover me",
                tooltip: "Tooltip text",
            },
        });

        expect(wrapper.text()).toContain("Tooltip text");
    });
});
