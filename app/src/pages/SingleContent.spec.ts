import "fake-indexeddb/auto";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import { setActivePinia } from "pinia";
import { createTestingPinia } from "@pinia/testing";
import SingleContent from "./SingleContent.vue";
import { mockPostDto, mockEnglishContentDto, mockCategoryContentDto } from "@/tests/mockdata";
import { type BaseDocumentDto } from "luminary-shared";
import { luminary } from "@/main";
import waitForExpect from "wait-for-expect";

vi.mock("vue-router");

describe("SinglePost", () => {
    beforeEach(() => {
        luminary.db.docs.bulkPut([
            mockPostDto,
            mockEnglishContentDto,
            mockCategoryContentDto,
        ] as BaseDocumentDto[]);

        setActivePinia(createTestingPinia());
    });

    afterEach(() => {
        luminary.db.docs.clear();
    });

    it("displays the loading spinner when no content is available", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
    });

    it("displays the content image", async () => {
        await luminary.db.docs.update(mockEnglishContentDto._id, { image: "test-image.jpg" });

        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("test-image.jpg");
        });
    });

    it("displays the content video when defined", async () => {
        await luminary.db.docs.update(mockEnglishContentDto._id, {
            image: "",
            video: "test-video.mp4",
        });

        const wrapper = shallowMount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("video-player-stub");
        });
    });

    it("displays the pusblish date content", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Jan 1, 2024");
        });
    });

    it("displays the summary content", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("This is an example post");
        });
    });

    it("displays the content text", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.find("p").exists()).toBe(true);
        });
    });

    it("displays tags", async () => {
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockEnglishContentDto.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain("Category 1");
        });
    });

    it("doesn't display tag when content not tagged", async () => {
        const mockContent = { ...mockEnglishContentDto, tags: [] };
        const wrapper = mount(SingleContent, {
            props: {
                slug: mockContent.slug,
            },
        });

        await waitForExpect(() => {
            expect(wrapper.html()).not.toContain("Tags");
        });
    });
});
