import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import MobileMenu from "./MobileMenu.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
}));

describe("MobileMenu.vue", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays the menu", async () => {
        const wrapper = mount(MobileMenu);

        expect(wrapper.html()).toContain("Home");
        expect(wrapper.html()).toContain("Explore");
    });

    it("navigates to the home page", async () => {
        const wrapper = mount(MobileMenu);

        const button = wrapper.find("button");

        await button.trigger("click");

        expect(routePushMock).toHaveBeenCalledWith({ name: "home" });
    });
});
