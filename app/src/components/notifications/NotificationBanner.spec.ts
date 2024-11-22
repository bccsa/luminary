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
