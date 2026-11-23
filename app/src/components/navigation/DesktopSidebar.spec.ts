import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, type PropType } from "vue";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import * as auth from "@/auth";
import DesktopSidebar from "./DesktopSidebar.vue";
import { mockLanguageDtoEng } from "@/tests/mockdata";
import { useDesktopSidebar } from "@/composables/useDesktopSidebar";
import { createDownloadsServiceStub, provideDownloadsStub } from "@/tests/downloadsServiceStub";

vi.mock("vue-router", () => ({
    useRouter: vi.fn().mockImplementation(() => ({ push: vi.fn() })),
    useRoute: vi.fn().mockImplementation(() => ({ name: "home", path: "/", query: {} })),
}));

vi.mock("@/auth", async () => (await import("@/tests/mockAuth")).createAuthMock());

vi.mock("vue-i18n", () => ({
    useI18n: () => ({
        t: (key: string, values: Record<string, unknown> = {}) =>
            (mockLanguageDtoEng.translations[key] || key).replace(/\{(\w+)\}/g, (_, name) =>
                String(values[name] ?? `{${name}}`),
            ),
    }),
}));

const navigate = vi.fn();
// Renders a custom RouterLink's slot, so the sidebar's links can be found and clicked.
const RouterLinkStub = defineComponent({
    props: {
        to: { type: Object as PropType<{ name: string }>, required: true },
        custom: Boolean,
    },
    setup(props, { slots }) {
        return () =>
            props.custom
                ? slots.default?.({
                      isActive: false,
                      href: `/${props.to.name}`,
                      navigate: (event?: Event) => {
                          event?.preventDefault();
                          navigate(props.to);
                      },
                  })
                : h("a", { href: `/${props.to.name}` }, slots.default?.());
    },
});

const mountSidebar = (provide: Record<symbol, unknown> = {}) =>
    mount(DesktopSidebar, {
        global: {
            provide,
            stubs: {
                RouterLink: RouterLinkStub,
                ThemeSelectorModal: true,
                LanguageModal: true,
                LDialog: true,
            },
        },
    });

describe("DesktopSidebar downloads link", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
        (auth as any).useAuth.mockReturnValue({ isAuthenticated: ref(false) });
        const { collapsed } = useDesktopSidebar();
        collapsed.value = false;
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("has My Activity and no downloads link without the downloads service", () => {
        const wrapper = mountSidebar();

        expect(wrapper.text()).toContain("My Activity");
        expect(wrapper.find("[data-test='sidebar-downloads']").exists()).toBe(false);
        expect(wrapper.text()).not.toContain("My Downloads");
    });

    it("links to My Downloads right after My Activity", async () => {
        const wrapper = mountSidebar(provideDownloadsStub(createDownloadsServiceStub()));

        const link = wrapper.get("[data-test='sidebar-downloads']");
        expect(link.text()).toBe("My Downloads");
        expect(link.attributes("href")).toBe("/downloads");
        const activity = wrapper.findAll("a").find((a) => a.attributes("href") === "/activity");
        expect(activity?.element.nextElementSibling).toBe(link.element);
        expect(wrapper.find("[data-test='sidebar-downloads-attention']").exists()).toBe(false);

        await link.trigger("click");
        expect(navigate).toHaveBeenCalledWith({ name: "downloads" });
    });

    it("shows the attention count, and a dot when collapsed", async () => {
        const service = createDownloadsServiceStub({ attentionCount: 3 });
        const wrapper = mountSidebar(provideDownloadsStub(service));

        expect(wrapper.get("[data-test='sidebar-downloads-attention']").text()).toBe("3");

        useDesktopSidebar().collapsed.value = true;
        await nextTick();
        const dot = wrapper.get("[data-test='sidebar-downloads-attention']");
        expect(dot.text()).toBe("");
        expect(dot.attributes("aria-label")).toBe("Downloads needing attention: 3");

        service.attentionRef.value = 0;
        await nextTick();
        expect(wrapper.find("[data-test='sidebar-downloads-attention']").exists()).toBe(false);
    });
});
