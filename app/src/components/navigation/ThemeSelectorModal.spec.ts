import { mount } from "@vue/test-utils";
import { describe, it, expect, beforeEach, vi } from "vitest";
import ThemeSelectorModal from "./ThemeSelectorModal.vue";
import LButton from "../button/LButton.vue";
import waitForExpect from "wait-for-expect";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import {
    appLanguageIdsAsRef,
    appLanguagePreferredIdAsRef,
    appLanguagesPreferredAsRef,
} from "@/globalConfig";

// @ts-expect-error
global.ResizeObserver = class FakeResizeObserver {
    observe() {}
    disconnect() {}
};

vi.mock("@auth0/auth0-vue");

vi.mock("vue-router", async (importOriginal) => {
    const actual = importOriginal();
    return {
        ...actual,
        useRouter: vi.fn(),
        useRoute: vi.fn().mockReturnValue({ name: "home" }),
        RouterView: { render: () => null },
    };
});

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("ThemeSelectorModal.vue", () => {
    beforeEach(() => {
        appLanguageIdsAsRef.value = [...appLanguageIdsAsRef.value, mockLanguageDtoEng._id];

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
        const wrapper = mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Select theme");
        });
    });

    it("does not render the modal when not visible", async () => {
        const wrapper = mount(ThemeSelectorModal, {
            props: {
                isVisible: false,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Select Theme");
        });
    });

    it("displays the correct themes", async () => {
        appLanguageIdsAsRef.value = [...appLanguageIdsAsRef.value, mockLanguageDtoEng._id];

        const wrapper = mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });

        await waitForExpect(async () => {
            expect(wrapper.html()).toContain("Light");
            expect(wrapper.html()).toContain("Dark");
            expect(wrapper.html()).toContain("System");
        });
    });

    it("selects the correct theme and updates localStorage", async () => {
        localStorage.setItem("theme", "Light");
        const wrapper = mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });

        const themeItems = wrapper.findAll("[data-test='switch-theme-button']");
        await themeItems[1].trigger("click");
        expect(localStorage.getItem("theme")).toBe("dark");
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
        localStorage.setItem("theme", "dark");
        mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });
        expect(document.documentElement.classList.contains("dark")).toBe(true);

        localStorage.setItem("theme", "light");
        mount(ThemeSelectorModal, {
            props: {
                isVisible: true,
            },
        });
        expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
});
