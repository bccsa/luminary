import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";

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
    it("renders the poster image", async () => {
        mount(VideoPlayer, {
            props: {
                content: mockEnglishContentDto,
            },
        });

        expect(srcMock).toHaveBeenCalledWith(
            expect.objectContaining({ src: mockEnglishContentDto.video }),
        );
        expect(posterMock).toHaveBeenCalledWith(mockEnglishContentDto.parentImage);
    });
});
