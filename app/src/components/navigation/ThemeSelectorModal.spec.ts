import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, vi } from "vitest";
import ThemeSelectorModal from "./ThemeSelectorModal.vue";
import LButton from "../button/LButton.vue";
import waitForExpect from "wait-for-expect";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

describe("ThemeSelectorModal.vue", () => {
    beforeEach(() => {
        window.matchMedia = vi.fn().mockImplementation((query) => ({
            matches: query === "(prefers-color-scheme: dark)",
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    });

    it("renders the modal when visible", async () => {
        mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });

        const body = document.querySelector("body");

        await waitForExpect(() => {
            expect(body!.innerHTML).toContain("Select Theme");
        });
    });

    it("does not render the modal when not visible", async () => {
        mount(ThemeSelectorModal, {
            props: {
                isVisible: false,
            },
        });

        const body = document.querySelector("body");

        await waitForExpect(() => {
            expect(body!.innerHTML).not.toContain("Select Theme");
        });
    });

    it("displays the correct themes", async () => {
        mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });

        const body = document.querySelector("body");

        await waitForExpect(() => {
            expect(body!.innerHTML).toContain("Light");
            expect(body!.innerHTML).toContain("Dark");
            expect(body!.innerHTML).toContain("System");
        });
    });

    it("selects the correct theme and updates localStorage", async () => {
        localStorage.setItem("theme", "Light");
        const wrapper = mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });
        const themeItems = wrapper.findAll("li");
        await themeItems[1].trigger("click");
        expect(localStorage.getItem("theme")).toBe("Dark");
    });

    it("emits close event when close button is clicked", async () => {
        const wrapper = mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
            components: {
                LButton,
            },
        });
        await wrapper.findComponent(LButton).trigger("click");
        expect(wrapper.emitted()).toHaveProperty("close");
    });

    it("applies the correct theme class on mount", () => {
        localStorage.setItem("theme", "Dark");
        mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });
        expect(document.documentElement.classList.contains("dark")).toBe(true);

        localStorage.setItem("theme", "Light");
        mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
});
