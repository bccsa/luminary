import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AuthDesignPage from "./AuthDesignPage.vue";

vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (key: string) => key, te: () => false }),
}));

describe("AuthDesignPage", () => {
    it("renders every artboard in both themes and leaves the app's theme class alone", () => {
        document.documentElement.classList.add("dark");
        const wrapper = mount(AuthDesignPage, { attachTo: document.body });

        // 21 screens, drawn light and dark.
        expect(wrapper.findAll("figure")).toHaveLength(42);
        expect(document.documentElement.classList.contains("dark")).toBe(false);

        wrapper.unmount();
        expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
});
