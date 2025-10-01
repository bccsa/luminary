import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import VideoPlayer from "./VideoPlayer.vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import waitForExpect from "wait-for-expect";

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
        const wrapper = mount(VideoPlayer, {
            props: {
                language: "lang-eng",
                content: mockEnglishContentDto,
            },
        });

        await waitForExpect(() => {
            expect(srcMock).toHaveBeenCalledWith(
                expect.objectContaining({ src: mockEnglishContentDto.parentMedia?.hlsUrl }),
            );
        });

        await waitForExpect(() => {
            // Check that the default poster image is set to a transparent pixel
            expect(posterMock).toHaveBeenCalledWith("/src/components/content/px.png");
        });

        await waitForExpect(() => {
            expect(wrapper.html()).toContain(
                mockEnglishContentDto.parentImageData?.fileCollections[0].imageFiles[0].filename,
            );
        });
    });
});
