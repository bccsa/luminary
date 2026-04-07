import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import NotificationBottom from "./NotificationBottom.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: vi.fn(),
    })),
}));

describe("NotificationBottom", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the title and description", () => {
        const wrapper = mount(NotificationBottom, {
            props: {
                notification: {
                    title: "Important News",
                    description: "Read this.",
                    state: "success",
                    type: "bottom",
                },
            },
        });

        expect(wrapper.text()).toContain("Important News");
        expect(wrapper.text()).toContain("Read this.");
    });

    it("renders with error state", () => {
        const wrapper = mount(NotificationBottom, {
            props: {
                notification: {
                    title: "Error",
                    description: "Something went wrong.",
                    state: "error",
                    type: "bottom",
                },
            },
        });

        expect(wrapper.text()).toContain("Error");
        expect(wrapper.text()).toContain("Something went wrong.");
    });

    it("renders with info state", () => {
        const wrapper = mount(NotificationBottom, {
            props: {
                notification: {
                    title: "Info",
                    description: "For your information.",
                    state: "info",
                    type: "bottom",
                },
            },
        });

        expect(wrapper.text()).toContain("Info");
        expect(wrapper.text()).toContain("For your information.");
    });

    it("renders with warning state", () => {
        const wrapper = mount(NotificationBottom, {
            props: {
                notification: {
                    title: "Warning",
                    description: "Be careful.",
                    state: "warning",
                    type: "bottom",
                },
            },
        });

        expect(wrapper.text()).toContain("Warning");
        expect(wrapper.text()).toContain("Be careful.");
    });
});
