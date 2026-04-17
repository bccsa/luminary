import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import MobileSideBar from "./MobileSideBar.vue";

describe("MobileSideBar", () => {
    it("renders the sidebar when open is true", () => {
        const wrapper = mount(MobileSideBar, {
            props: { open: true },
            global: {
                stubs: {
                    SideBar: { template: "<div />" },
                },
            },
        });

        const overlay = wrapper.find("[data-test='mobile-sidebar']");
        expect(overlay.exists()).toBe(true);
    });

    it("does not render when open is false", () => {
        const wrapper = mount(MobileSideBar, {
            props: { open: false },
            global: {
                stubs: {
                    SideBar: { template: "<div />" },
                },
            },
        });

        const overlay = wrapper.find("[data-test='mobile-sidebar']");
        expect(overlay.exists()).toBe(false);
    });

    it("emits update:open with false when close button is clicked", async () => {
        const wrapper = mount(MobileSideBar, {
            props: { open: true },
            global: {
                stubs: {
                    SideBar: { template: "<div />" },
                },
            },
        });

        const closeButton = wrapper.find("[data-test='close-sidebar']");
        await closeButton.trigger("click");

        expect(wrapper.emitted("update:open")).toBeTruthy();
        expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    });

    it("emits update:open with false when SideBar emits close", async () => {
        const wrapper = mount(MobileSideBar, {
            props: { open: true },
            global: {
                stubs: {
                    SideBar: true,
                },
            },
        });

        const sideBar = wrapper.findComponent({ name: "SideBar" });
        await sideBar.vm.$emit("close");

        expect(wrapper.emitted("update:open")).toBeTruthy();
        expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    });
});
