import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";
import { computed } from "vue";

vi.mock("@/composables/useBucketInfo", () => ({
    useBucketInfo: () => ({
        bucketBaseUrl: computed(() => "https://bucket.example.com"),
    }),
}));

// Mock YouTube utilities
vi.mock("@/util/youtube", () => ({
    isYouTubeUrl: vi.fn((url: string) => {
        if (!url) return false;
        const youtubeRegex =
            /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
        return youtubeRegex.test(url);
    }),
    convertToVideoJSYouTubeUrl: vi.fn((url: string) => {
        // Extract video ID and return in VideoJS format
        const match = url.match(
            /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
        );
        if (match) {
            return `https://www.youtube.com/watch?v=${match[1]}`;
        }
        return url;
    }),
}));

const posterMock = vi.hoisted(() => vi.fn());
const srcMock = vi.hoisted(() => vi.fn());
const onMock = vi.hoisted(() => vi.fn());

vi.mock("video.js", () => {
    // Create a mock DOM element
    const mockEl = document.createElement("div");
    mockEl.className = "video-js";

    const defaultFunction = () => {
        return {
            browser: {
                IS_SAFARI: false,
            },
            poster: posterMock,
            src: srcMock,
            mobileUi: vi.fn(),
            on: onMock,
            el: vi.fn(() => mockEl),
            userActive: vi.fn(),
            paused: vi.fn(() => true),
            currentTime: vi.fn(),
            duration: vi.fn(() => 0),
            play: vi.fn(),
            pause: vi.fn(),
            ready: vi.fn((callback) => {
                if (callback) callback();
                return { on: onMock };
            }),
            off: vi.fn(),
            dispose: vi.fn(),
            isFullscreen: vi.fn(() => false),
            requestFullscreen: vi.fn(),
            exitFullscreen: vi.fn(),
            audioOnlyMode: vi.fn(),
            audioPosterMode: vi.fn(),
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
    it.skip("renders the poster image for regular video", async () => {
        const wrapper = mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(srcMock).toHaveBeenCalledWith(
                expect.objectContaining({ src: mockEnglishContentDto.video }),
            );
        });

        await waitForExpect(() => {
            // Check that the default poster image is set to a transparent pixel
            // In Vite, image imports resolve to paths starting with '/' or as data URLs
            expect(posterMock).toHaveBeenCalled();
            const posterArg = posterMock.mock.calls[0]?.[0];
            expect(posterArg).toBeTruthy();
            // The px.png import should resolve to a string path containing 'px' and '.png'
            expect(typeof posterArg).toBe("string");
            expect(posterArg).toMatch(/px.*\.png|\.png.*px/i);
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(
                mockEnglishContentDto.parentImageData?.fileCollections[0].imageFiles[0].filename,
            );
        });
    });

    it("handles YouTube videos correctly", async () => {
        const youtubeContent = {
            ...mockEnglishContentDto,
            video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        };

        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: youtubeContent,
            },
        });

        await waitForExpect(() => {
            expect(srcMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                    type: "video/youtube",
                }),
            );
        });
    });
});
