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
});
