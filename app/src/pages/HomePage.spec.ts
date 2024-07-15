import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import HomePage from "./HomePage.vue";
import { setActivePinia, createPinia } from "pinia";
import * as auth0 from "@auth0/auth0-vue";
import { ref } from "vue";
import { db, TagType, type queryOptions } from "luminary-shared";

vi.mock("@auth0/auth0-vue");
vi.mock("luminary-shared", async () => {
    const actual = await vi.importActual("luminary-shared");
    return {
        ...actual,
        db: {
            someByTypeAsRef: vi.fn(),
            tagsWhereTagTypeAsRef: vi.fn(),
        },
    };
});

// Mock the IgnorePagePadding and HorizontalScrollableTagViewer components
vi.mock("@/components/IgnorePagePadding.vue", () => ({
    default: { template: "<div><slot /></div>" },
}));
vi.mock("@/components/tags/HorizontalScrollableTagViewer.vue", () => ({
    default: {
        props: ["title", "queryOptions", "tag"],
        template: '<div>{{ title }} {{ tag ? tag.name : "" }}</div>',
    },
}));

describe("HomePage", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        (auth0 as any).useAuth0 = vi.fn().mockReturnValue({
            isLoading: ref(false),
            isAuthenticated: ref(true),
        });
        (db.someByTypeAsRef as any).mockReturnValue(true);
        (db.tagsWhereTagTypeAsRef as any).mockImplementation(
            (tagType: TagType.Category, options: queryOptions) => {
                if (options.filterOptions?.pinned) {
                    return [{ _id: "1", name: "Pinned Category" }];
                }
                return [
                    { _id: "2", name: "Unpinned Category" },

                    // empty category
                    { _id: "2", name: "" },
                ];
            },
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it.skip("displays a message when there are no contents", async () => {
        (db.someByTypeAsRef as any).mockReturnValue(false);

        const wrapper = mount(HomePage);

        expect(wrapper.text()).toContain(
            "You don't have access to any content. If you believe this is an error, send your contact person a message.",
        );
    });

    it.skip("displays the categories", async () => {
        const wrapper = mount(HomePage);

        expect(wrapper.text()).toContain("Pinned Category");
        expect(wrapper.text()).toContain("Unpinned Category");
    });

    it.skip("does not display an empty category", async () => {
        const wrapper = mount(HomePage);

        expect(wrapper.text()).not.toContain(undefined);
    });

    it.skip("displays the content", async () => {
        const wrapper = mount(HomePage);

        // Check for the "Newest Content" section
        expect(wrapper.text()).toContain("Newest Content");
    });
});
