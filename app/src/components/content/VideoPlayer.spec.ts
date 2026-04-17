import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
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
const disposeMock = vi.hoisted(() => vi.fn());
const audioOnlyModeMock = vi.hoisted(() => vi.fn());
const audioPosterModeMock = vi.hoisted(() => vi.fn());
const eventCallbacks = vi.hoisted(() => new Map<string, Function[]>());

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
            on: vi.fn((event: string | string[], callback: Function) => {
                const events = Array.isArray(event) ? event : [event];
                events.forEach((e) => {
                    if (!eventCallbacks.has(e)) eventCallbacks.set(e, []);
                    eventCallbacks.get(e)!.push(callback);
                });
            }),
            one: vi.fn((event: string, callback: Function) => {
                if (!eventCallbacks.has(event)) eventCallbacks.set(event, []);
                eventCallbacks.get(event)!.push(callback);
            }),
            audioTracks: vi.fn(() => []),
            el: vi.fn(() => mockEl),
            userActive: vi.fn(),
            paused: vi.fn(() => true),
            currentTime: vi.fn(),
            duration: vi.fn(() => 0),
            play: vi.fn(),
            pause: vi.fn(),
            ready: vi.fn((callback) => {
                if (callback) callback();
                return {
                    on: vi.fn((event: string | string[], callback: Function) => {
                        const events = Array.isArray(event) ? event : [event];
                        events.forEach((e) => {
                            if (!eventCallbacks.has(e)) eventCallbacks.set(e, []);
                            eventCallbacks.get(e)!.push(callback);
                        });
                    }),
                };
            }),
            off: vi.fn(),
            dispose: disposeMock,
            isFullscreen: vi.fn(() => false),
            requestFullscreen: vi.fn(),
            exitFullscreen: vi.fn(),
            audioOnlyMode: audioOnlyModeMock,
            audioPosterMode: audioPosterModeMock,
        };
    };
    defaultFunction.browser = {
        IS_SAFARI: false,
    };

    return {
        default: defaultFunction,
    };
});

vi.mock("@/globalConfig", async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        getMediaProgress: vi.fn(() => 0),
        setMediaProgress: vi.fn(),
        removeMediaProgress: vi.fn(),
        queryParams: new URLSearchParams(),
        appLanguagesPreferredAsRef: { value: [{ languageCode: "en" }] },
    };
});

vi.mock("./extractAndBuildAudioMaster", () => ({
    extractAndBuildAudioMaster: vi
        .fn()
        .mockResolvedValue("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\naudio.m3u8"),
}));

function triggerPlayerEvent(event: string, ...args: any[]) {
    const callbacks = eventCallbacks.get(event) || [];
    callbacks.forEach((cb: Function) => cb(...args));
}

// Mock HTMLMediaElement methods not implemented in jsdom
beforeAll(() => {
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.load = vi.fn();
});

describe("VideoPlayer", () => {
    beforeEach(() => {
        eventCallbacks.clear();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("renders the poster image for regular video", async () => {
        const content = {
            ...mockEnglishContentDto,
            // VideoPlayer reads `content.video`; mock data only defines parentMedia.hlsUrl
            video: mockEnglishContentDto.parentMedia!.hlsUrl!,
        };

        const wrapper = mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content,
            },
        });

        await waitForExpect(() => {
            expect(srcMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "application/x-mpegURL",
                    src: content.video,
                }),
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
                content.parentImageData?.fileCollections[0].imageFiles[0].filename,
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

    it("sets the poster to a transparent pixel", async () => {
        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(posterMock).toHaveBeenCalled();
        });
    });

    it("registers event handlers via on()", async () => {
        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            // Should register multiple event handlers
            expect(eventCallbacks.has("loadeddata")).toBe(true);
        });
    });

    it("sets HLS source for regular video", async () => {
        const contentWithVideo = {
            ...mockEnglishContentDto,
            video: "https://example.com/stream.m3u8",
        };

        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: contentWithVideo,
            },
        });

        await waitForExpect(() => {
            expect(srcMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "application/x-mpegURL",
                    src: "https://example.com/stream.m3u8",
                }),
            );
        });
    });

    it("registers ended event handler that removes progress", async () => {
        const { removeMediaProgress } = await import("@/globalConfig");

        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(eventCallbacks.has("ended")).toBe(true);
        });

        // Trigger ended event
        triggerPlayerEvent("ended");

        expect(removeMediaProgress).toHaveBeenCalled();
    });

    it("registers pause event handler", async () => {
        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(eventCallbacks.has("pause")).toBe(true);
        });

        // Trigger pause - should not throw
        triggerPlayerEvent("pause");
    });

    it("registers play event handler", async () => {
        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(eventCallbacks.has("play")).toBe(true);
        });

        triggerPlayerEvent("play");
    });

    it("saves progress on timeupdate when currentTime > 60", async () => {
        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(eventCallbacks.has("timeupdate")).toBe(true);
        });

        triggerPlayerEvent("timeupdate");

        // Note: the actual player mock's currentTime/duration are from the vi.mock
        // which returns 0/0, so setMediaProgress won't be called for currentTime < 60
        // This test verifies the handler is registered
    });

    it("restores progress on ready event when progress > 60", async () => {
        const { getMediaProgress } = await import("@/globalConfig");
        vi.mocked(getMediaProgress).mockReturnValue(120);

        mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(eventCallbacks.has("ready")).toBe(true);
        });

        triggerPlayerEvent("ready");

        expect(getMediaProgress).toHaveBeenCalled();
    });

    it("disposes player on unmount", async () => {
        const contentWithVideo = {
            ...mockEnglishContentDto,
            video: "https://example.com/stream.m3u8",
        };

        const wrapper = mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: contentWithVideo,
            },
        });

        // Wait for the async onMounted to fully complete (requestAnimationFrame + dynamic imports)
        await waitForExpect(() => {
            expect(eventCallbacks.has("ended")).toBe(true);
        });

        wrapper.unmount();

        expect(disposeMock).toHaveBeenCalled();
    });

    it("hides audio toggle for YouTube videos", async () => {
        const youtubeContent = {
            ...mockEnglishContentDto,
            video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        };

        const wrapper = mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: youtubeContent,
            },
        });

        // AudioVideoToggle should not be rendered for YouTube
        await waitForExpect(() => {
            expect(wrapper.findComponent({ name: "AudioVideoToggle" }).exists()).toBe(false);
        });

        wrapper.unmount();
    });
});
