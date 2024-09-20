import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

import MainMenu from "./MainMenu.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
}));

describe("MainMenu", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders correctly", () => {
        const wrapper = mount(MainMenu);

        expect(wrapper.html()).toContain("Home");
        expect(wrapper.html()).toContain("Explore");
    });

    it("navigates to the home page", () => {
        const wrapper = mount(MainMenu);

        const homeMenu = wrapper.find("a");

        homeMenu.trigger("click");

        expect(routePushMock).toHaveBeenCalledWith({
            name: "home",
        });
    });
});
