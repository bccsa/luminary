import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ContentTile from "./ContentTile.vue";
import { DocType, PublishStatus, type ContentDto } from "luminary-shared";

vi.mock("vue-router");

describe("ContentTile", () => {
    const mockEnglishContentDto: ContentDto = {
        _id: "content-post1-eng",
        type: DocType.Content,
        parentId: "post-post1",
        parentType: DocType.Post,
        updatedTimeUtc: 1704114000000,
        memberOf: ["group-public-content"],
        tags: ["tag-category1"],
        language: "lang-eng",
        status: PublishStatus.Published,
        slug: "post1-eng",
        title: "Post 1",
        summary: "This is an example post",
        author: "ChatGPT",
        text: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"In the quiet town of Willowdale, little Lily wept as her beloved cat, Whiskers, went missing. Frantically searching the neighborhood, she stumbled upon Fireman Jake, known for his kind heart. With a reassuring smile, he promised to help. Lily clung to hope as they combed the streets together. Beneath a dusty porch, they found Whiskers, scared but unharmed. Grateful tears filled Lily\'s eyes as Fireman Jake handed her the rescued feline. Their small town echoed with cheers as Lily hugged her furry friend, and from that day forward, Fireman Jake became a hero in her heart and the community\'s beloved guardian"}]}]}',
        localisedImage: "",
        audio: "",
        video: "",
        publishDate: 1704114000000,
        expiryDate: undefined,
        image: "test-image.jpg",
    };

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

        console.log(wrapper.html());
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
});
