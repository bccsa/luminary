import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import MobileMenu from "./MobileMenu.vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import { mockLanguageDtoEng } from "@/tests/mockdata";

const routePushMock = vi.hoisted(() => vi.fn());
vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({
        push: routePushMock,
    })),
    useRoute: vi.fn().mockImplementation(() => ({
        fullPath: "/",
        name: "home",
    })),
}));

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string) => mockLanguageDtoEng.translations[key] || key,
    }),
}));

describe("MobileMenu.vue", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the navigation items", async () => {
        const wrapper = mount(MobileMenu);

        const homeMenu = wrapper.findComponent(RouterLinkStub);

        expect(homeMenu.props("to")).toEqual({ name: "home" });
    });

    it("keeps the bottom navigation above a device safe area or the native navigation bar", () => {
        const wrapper = mount(MobileMenu);

        expect(wrapper.classes()).toContain(
            "pb-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.625rem),calc(var(--native-inset-bottom,0px)+0.5rem))]",
        );
    });

    it("gives every tab an equal share of the bar, whatever its label's length", () => {
        const wrapper = mount(MobileMenu);

        // The profile menu's side panel also renders here in tests; tabs are the children with a label.
        const tabs = Array.from(wrapper.element.children as HTMLCollectionOf<HTMLElement>).filter(
            (el) => el.querySelector(":scope > span"),
        );
        expect(tabs).toHaveLength(5);
        for (const tab of tabs) {
            expect(tab.classList).toContain("flex-1");
            expect(tab.classList).toContain("basis-0");
            expect(tab.classList).toContain("min-w-0");
            expect(tab.querySelector("span")?.classList).toContain("truncate");
        }
    });

    describe("its published height", () => {
        let observed: { box?: ResizeObserverBoxOptions } | undefined;
        let height = 90;
        let measured: { mockRestore: () => void };

        beforeEach(() => {
            observed = undefined;
            height = 90;
            vi.stubGlobal(
                "ResizeObserver",
                class {
                    observe(_el: Element, options?: ResizeObserverOptions) {
                        observed = options;
                    }
                    disconnect() {}
                },
            );
            measured = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
                () => ({ height }) as DOMRect,
            );
        });
        afterEach(() => {
            vi.unstubAllGlobals();
            measured.mockRestore();
        });

        it("watches the border box, which the safe-area padding is part of", () => {
            const wrapper = mount(MobileMenu);

            expect(observed?.box).toBe("border-box");
            expect(document.documentElement.style.getPropertyValue("--mobile-menu-h")).toBe("90px");
            wrapper.unmount();
        });

        it("is measured again when a turn of the phone resizes the window", () => {
            const wrapper = mount(MobileMenu);

            height = 78;
            window.dispatchEvent(new Event("resize"));

            expect(document.documentElement.style.getPropertyValue("--mobile-menu-h")).toBe("78px");
            wrapper.unmount();
        });

        it("is taken away, and no longer measured, once the menu is gone", () => {
            const wrapper = mount(MobileMenu);
            wrapper.unmount();

            window.dispatchEvent(new Event("resize"));

            expect(document.documentElement.style.getPropertyValue("--mobile-menu-h")).toBe("");
        });
    });
});
