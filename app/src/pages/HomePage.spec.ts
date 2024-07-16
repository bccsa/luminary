import "fake-indexeddb/auto";
import { mount } from "@vue/test-utils";
import { describe, it, beforeEach, expect, vi } from "vitest";
import HomePage from "./HomePage.vue";
import { useGlobalConfigStore } from "@/stores/globalConfig";
import * as auth0 from "@auth0/auth0-vue";
import * as db from "luminary-shared";
import { ref } from "vue";
import { mockLanguageDtoEng, mockLanguageDtoFra, mockLanguageDtoSwa } from "@/tests/mockdata";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@auth0/auth0-vue");
vi.mock("luminary-shared");

// Mock the components used in HomePage
vi.mock("@/components/tags/HorizontalScrollableTagViewer.vue", () => ({
    default: { template: '<div class="horizontal-scrollable-tag-viewer"></div>' },
}));

vi.mock("@/components/tags/HorizontalScrollableTagViewerCollection.vue", () => ({
    default: { template: '<div class="horizontal-scrollable-tag-viewer-collection"></div>' },
}));

vi.mock("@/components/IgnorePagePadding.vue", () => ({
    default: { template: '<div class="ignore-page-padding"><slot /></div>' },
}));

describe("HomePage.vue", () => {
    beforeEach(() => {
        setActivePinia(createTestingPinia());
    });

    it("renders correctly with no content and not authenticated", () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(false),
        });
        const wrapper = mount(HomePage);

        expect(wrapper.text()).toContain(
            "There is currently no content available. If you have an account, first  log in.",
        );
    });

    it("renders correctly with no content and authenticated", () => {
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isAuthenticated: ref(true),
        });
        const wrapper = mount(HomePage);

        expect(wrapper.text()).toContain(
            "You don't have access to any content. If you believe this is an error, send your contact person a message.",
        );
    });

    it.skip("renders correctly the Categories", async () => {});
    it.skip("does not display an empty category", async () => {});
    it.skip("displays the content", async () => {});
});
