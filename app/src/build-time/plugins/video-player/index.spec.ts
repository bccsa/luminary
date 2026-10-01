import { describe, expect, it, vi } from "vitest";

vi.mock("@luminary-media-converter/player-web", () => ({ LuminaryPlayer: { name: "LuminaryPlayer" } }));

import { LuminaryPlayer } from "@luminary-media-converter/player-web";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import { installVideoPlayer } from "./index";

describe("installVideoPlayer", () => {
    it("provides the encoder's Video.js player, which takes no lock-screen metadata", () => {
        const provide = vi.fn();

        installVideoPlayer({ provide } as never);

        expect(provide).toHaveBeenCalledWith(VideoPlayerKey, {
            component: LuminaryPlayer,
            acceptsNowPlaying: false,
        });
    });
});
