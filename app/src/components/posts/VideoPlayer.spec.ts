import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContent, mockPost, mockPostDto } from "@/tests/mockData";
import { type ContentDto, DocType, PublishStatus } from "luminary-shared";

const posterMock = vi.hoisted(() => vi.fn());
const srcMock = vi.hoisted(() => vi.fn());

vi.mock("video.js", () => {
    const defaultFunction = () => {
        return {
            browser: {
                IS_SAFARI: false,
            },
            poster: posterMock,
            src: srcMock,
            mobileUi: vi.fn(),
            on: vi.fn(),
        };
    };
    defaultFunction.browser = {
        IS_SAFARI: false,
    };

    return {
        default: defaultFunction,
    };
});

describe("VideoPlayer", () => {
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
        video: "test-video-url.m3u8",
        publishDate: 1704114000000,
        expiryDate: undefined,
        image: "test-image.jpg",
    };

    it("renders the poster image", async () => {
        mount(VideoPlayer, {
            props: {
                contentParent: mockPostDto,
                content: mockEnglishContentDto,
            },
        });

        expect(srcMock).toHaveBeenCalledWith(
            expect.objectContaining({ src: mockEnglishContentDto.video }),
        );
        expect(posterMock).toHaveBeenCalledWith(mockPostDto.image);
    });
});
