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
});
