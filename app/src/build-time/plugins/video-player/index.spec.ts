import { describe, expect, it, vi } from "vitest";

vi.mock("@luminary-media-converter/player-web", () => ({
    LuminaryPlayer: { name: "LuminaryPlayer" },
}));

import { LuminaryPlayer } from "@luminary-media-converter/player-web";
import { VideoPlayerKey } from "@/build-time/contracts/video-player/token";
import { installVideoPlayer } from "./index";

describe("installVideoPlayer", () => {
    it("provides the encoder's Video.js player, which takes no lock-screen metadata", () => {
        const provide = vi.fn();

        installVideoPlayer({ provide } as never);

        expect(provide).toHaveBeenCalledWith(
            VideoPlayerKey,
            expect.objectContaining({ component: LuminaryPlayer, acceptsNowPlaying: false }),
        );
    });

    it("hands it the videos up next, for its panel and for the strip near the end", () => {
        // The page hands a player only the lists it says it takes.
        const provide = vi.fn();

        installVideoPlayer({ provide } as never);

        expect(provide).toHaveBeenCalledWith(
            VideoPlayerKey,
            expect.objectContaining({ acceptsBrowse: true, acceptsNextUp: true }),
        );
    });
});
