import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AuthProviderFormErrors from "./AuthProviderFormErrors.vue";

describe("AuthProviderFormErrors.vue", () => {
    it("renders nothing when errors array is empty", () => {
        const wrapper = mount(AuthProviderFormErrors, {
            props: { errors: [] },
        });

        expect(wrapper.find("div").exists()).toBe(false);
    });

    it("renders each error message", () => {
        const wrapper = mount(AuthProviderFormErrors, {
            props: { errors: ["Field is required", "Invalid domain format"] },
        });

        expect(wrapper.html()).toContain("Field is required");
        expect(wrapper.html()).toContain("Invalid domain format");
    });

    it("renders one entry per error", () => {
        const wrapper = mount(AuthProviderFormErrors, {
            props: { errors: ["Error A", "Error B", "Error C"] },
        });

        const items = wrapper.findAll("p");
        expect(items).toHaveLength(3);
    });

    it("renders an icon alongside each error message", () => {
        const wrapper = mount(AuthProviderFormErrors, {
            props: { errors: ["Something went wrong"] },
        });

        // Each error row has an svg icon
        expect(wrapper.findAll("svg")).toHaveLength(1);
    });
});
