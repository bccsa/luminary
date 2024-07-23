import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentTile from "./ContentTile.vue";
import { createRouter, createWebHistory } from "vue-router";
import { mockEnglishContentDto } from "@/tests/mockdata";
import SingleContent from "@/pages/SingleContent.vue";

vi.mock("vue-router", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        // @ts-expect-error
        ...actual,
        useRouter: () => ({
            push: vi.fn(),
        }),
    };
});
describe("ContentTile", () => {
    it("renders the image of content", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });
        expect(wrapper.find("img").exists()).toBe(true);
        expect(wrapper.find("img").attributes("src")).toBe("test-image.jpg");
    });

    it("renders a tile for a post", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).toContain("Post 1");
        expect(wrapper.text()).toContain("Jan 1, 2024");
    });

    it("display the publish date", async () => {
        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
        });

        expect(wrapper.text()).toContain("Jan 1, 2024");
    });

    it("navigates to the correct route on click", async () => {
        const routes = [{ path: "/:slug", name: "post", component: SingleContent }];

        const router = createRouter({
            history: createWebHistory(),
            routes,
        });

        const wrapper = mount(ContentTile, {
            props: {
                content: mockEnglishContentDto,
            },
            global: {
                plugins: [router],
            },
        });

        const push = vi.spyOn(wrapper.vm.$router, "push");

        await wrapper.trigger("click");

        await router.push(`/${mockEnglishContentDto.slug}`);
        await router.isReady();

        expect(push).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledWith(`/${mockEnglishContentDto.slug}`);
    });
});
