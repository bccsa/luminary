import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import LDropdown from "./LDropdown.vue";
import { nextTick } from "vue";

// Mock @vueuse/core
vi.mock("@vueuse/core", () => ({
    onClickOutside: vi.fn(),
    useElementBounding: vi.fn(() => ({
        left: { value: 0 },
        top: { value: 100 },
        bottom: { value: 140 },
        right: { value: 200 },
        width: { value: 200 },
        update: vi.fn(),
    })),
    useWindowSize: vi.fn(() => ({
        height: { value: 800 },
        width: { value: 1200 },
    })),
}));
describe("LDropdown", () => {
    it("does not show panel when show is false", () => {
        const wrapper = mount(LDropdown, {
            props: { show: false, "onUpdate:show": () => {} },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    });

    it("shows panel when show is true", () => {
        const wrapper = mount(LDropdown, {
            props: { show: true, "onUpdate:show": () => {} },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        expect(wrapper.find('[role="menu"]').exists()).toBe(true);
        expect(wrapper.text()).toContain("Content");
    });

    it("toggles show on trigger click", async () => {
        const onUpdate = vi.fn();
        const wrapper = mount(LDropdown, {
            props: { show: false, "onUpdate:show": onUpdate },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        await wrapper.find('[data-dropdown-trigger]').trigger("click");
        expect(onUpdate).toHaveBeenCalledWith(true);
    });

    it("closes on Escape key", async () => {
        const onUpdate = vi.fn();
        const wrapper = mount(LDropdown, {
            props: { show: true, "onUpdate:show": onUpdate },
            slots: {
                trigger: "<button>Toggle</button>",
                default: '<div role="menuitem">Item</div>',
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        await wrapper.find('[role="menu"]').trigger("keydown", { key: "Escape" });
        expect(onUpdate).toHaveBeenCalledWith(false);
    });

    it("applies padding class based on padding prop", () => {
        const wrapper = mount(LDropdown, {
            props: { show: true, padding: "small", "onUpdate:show": () => {} },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        expect(wrapper.find(".p-1").exists()).toBe(true);
    });

    it("applies medium padding class", () => {
        const wrapper = mount(LDropdown, {
            props: { show: true, padding: "medium", "onUpdate:show": () => {} },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        expect(wrapper.find(".p-2").exists()).toBe(true);
    });

    it("applies large padding class", () => {
        const wrapper = mount(LDropdown, {
            props: { show: true, padding: "large", "onUpdate:show": () => {} },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        expect(wrapper.find(".p-3").exists()).toBe(true);
    });

    it("toggles on Enter key on trigger", async () => {
        const onUpdate = vi.fn();
        const wrapper = mount(LDropdown, {
            props: { show: false, "onUpdate:show": onUpdate },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        await wrapper.find('[data-dropdown-trigger]').trigger("keydown.enter");
        expect(onUpdate).toHaveBeenCalledWith(true);
    });

    it("sets aria-expanded correctly", async () => {
        const wrapper = mount(LDropdown, {
            props: { show: false, "onUpdate:show": () => {} },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        expect(wrapper.find('[data-dropdown-trigger]').attributes("aria-expanded")).toBe("false");

        await wrapper.setProps({ show: true });
        expect(wrapper.find('[data-dropdown-trigger]').attributes("aria-expanded")).toBe("true");
    });

    it("does not toggle when event is defaultPrevented", async () => {
        const onUpdate = vi.fn();
        const wrapper = mount(LDropdown, {
            props: { show: false, "onUpdate:show": onUpdate },
            slots: {
                trigger: "<button>Toggle</button>",
                default: "<div>Content</div>",
            },
            global: {
                stubs: { LTeleport: { template: "<div><slot /></div>" } },
            },
        });

        const trigger = wrapper.find('[data-dropdown-trigger]');
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });
        event.preventDefault();
        trigger.element.dispatchEvent(event);

        await nextTick();
        // The event was prevented, so show should not change
        expect(onUpdate).not.toHaveBeenCalled();
    });
});
