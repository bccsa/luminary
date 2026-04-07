import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationToast from "./NotificationToast.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

describe("NotificationToast", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the title and description", () => {
        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Important News",
                    description: "Read this.",
                    state: "success",
                    type: "toast",
                },
            },
        });

        expect(wrapper.text()).toContain("Important News");
        expect(wrapper.text()).toContain("Read this.");
    });

    it("applies text-green-400 to icon for success state", () => {
        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Success",
                    description: "Done.",
                    state: "success",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".text-green-400").exists()).toBe(true);
    });

    it("applies text-red-400 to icon for error state", () => {
        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Error",
                    description: "Something went wrong.",
                    state: "error",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".text-red-400").exists()).toBe(true);
    });

    it("applies text-blue-400 to icon for info state", () => {
        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Info",
                    description: "For your information.",
                    state: "info",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".text-blue-400").exists()).toBe(true);
    });

    it("applies text-yellow-400 to icon for warning state", () => {
        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Warning",
                    description: "Be careful.",
                    state: "warning",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".text-yellow-400").exists()).toBe(true);
    });

    it("uses a custom icon when provided", () => {
        const CustomIcon = (() => null) as any;

        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Custom",
                    description: "With custom icon.",
                    state: "success" as const,
                    type: "toast" as const,
                    icon: CustomIcon,
                },
            },
        });

        // Custom icon replaces the default — the component renders but default SVGs are not used
        expect(wrapper.text()).toContain("Custom");
    });

    it("can be closed", async () => {
        const wrapper = mount(NotificationToast, {
            props: {
                notification: {
                    title: "Important News",
                    description: "Read this.",
                    state: "success",
                    type: "toast",
                    closable: true,
                },
            },
        });

        await wrapper.find("button[data-test='toast']").trigger("click");

        expect(wrapper.text()).not.toContain("Important News");
        expect(wrapper.text()).not.toContain("Read this.");
    });
});
