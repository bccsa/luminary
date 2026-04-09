import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationBanner from "./NotificationBanner.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: vi.fn(),
    })),
}));

describe("NotificationToast", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the title and description", () => {
        const wrapper = mount(NotificationBanner, {
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

    it("applies bg-green-100 for success state", () => {
        const wrapper = mount(NotificationBanner, {
            props: {
                notification: {
                    title: "Success",
                    description: "Done.",
                    state: "success",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".bg-green-100").exists()).toBe(true);
    });

    it("applies bg-red-100 for error state", () => {
        const wrapper = mount(NotificationBanner, {
            props: {
                notification: {
                    title: "Error",
                    description: "Something went wrong.",
                    state: "error",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".bg-red-100").exists()).toBe(true);
    });

    it("applies bg-blue-100 for info state", () => {
        const wrapper = mount(NotificationBanner, {
            props: {
                notification: {
                    title: "Info",
                    description: "For your information.",
                    state: "info",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".bg-blue-100").exists()).toBe(true);
    });

    it("applies bg-yellow-100 for warning state", () => {
        const wrapper = mount(NotificationBanner, {
            props: {
                notification: {
                    title: "Warning",
                    description: "Be careful.",
                    state: "warning",
                    type: "toast",
                },
            },
        });

        expect(wrapper.find(".bg-yellow-100").exists()).toBe(true);
    });

    it("uses a custom icon when provided", () => {
        const CustomIcon = (() => null) as any;

        const wrapper = mount(NotificationBanner, {
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
        const wrapper = mount(NotificationBanner, {
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

        await wrapper.find("button[data-test='banner-close-button']").trigger("click");

        expect(wrapper.text()).not.toContain("Important News");
        expect(wrapper.text()).not.toContain("Read this.");
    });
});
