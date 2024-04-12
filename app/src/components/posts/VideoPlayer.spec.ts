import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContent, mockPost } from "@/tests/mockData";

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
            mobileUi: () => {},
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
    it("renders the poster image", async () => {
        mount(VideoPlayer, {
            props: { contentParent: mockPost },
        });

        expect(srcMock).toHaveBeenCalledWith(
            expect.objectContaining({ src: mockEnglishContent.video }),
        );
        expect(posterMock).toHaveBeenCalledWith(mockPost.image);
    });
});
