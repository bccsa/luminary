import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import PostOverview from "./PostOverview.vue";
import { usePostStore } from "@/stores/post";
import { ContentStatus, DocType } from "@/types";
import EmptyState from "@/components/EmptyState.vue";

vi.mock("vue-router", () => ({
    resolve: vi.fn(),
    RouterLink: vi.fn(),
}));

describe("PostOverview", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("displays posts from the store", async () => {
        const pinia = createTestingPinia();
        const store = usePostStore();

        store.posts = [
            {
                type: DocType.Post,
                _id: "post-post1",
                updatedTimeUtc: 3,
                memberOf: [],
                content: [
                    {
                        _id: "content-post1-eng",
                        type: DocType.Content,
                        updatedTimeUtc: 3,
                        memberOf: [],
                        language: {
                            _id: "lang-eng",
                            type: DocType.Language,
                            updatedTimeUtc: 3,
                            memberOf: [],
                            languageCode: "eng",
                            name: "English",
                        },
                        status: ContentStatus.Published,
                        slug: "post1-eng",
                        title: "English translation title",
                        summary: "This is an example post",
                        text: "In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily's eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community's beloved guardian.",
                        publishDate: 3,
                    },
                ],
                tags: [],
            },
        ];

        const wrapper = mount(PostOverview, {
            global: {
                plugins: [pinia],
            },
        });

        expect(wrapper.html()).toContain("English translation title");
    });

    it("displays an empty state if there are no posts", async () => {
        const pinia = createTestingPinia();

        const wrapper = mount(PostOverview, {
            global: {
                plugins: [pinia],
            },
        });

        expect(wrapper.findComponent(EmptyState).exists()).toBe(true);
    });
});
