import { describe, expect, it, vi } from "vitest";
import { createYouTubePlayer, isYouTubeReport, type YouTubeReport } from "./youtubePlayer";

const report = (r: Partial<YouTubeReport>): YouTubeReport => ({
    src: "lmc-yt",
    type: "state",
    ...r,
});

function make() {
    const sent: unknown[] = [];
    const onEnded = vi.fn();
    const onLoadedMetadata = vi.fn();
    const onTimeUpdate = vi.fn();
    const player = createYouTubePlayer({
        send: (command) => sent.push(command),
        onEnded,
        onLoadedMetadata,
        onTimeUpdate,
    });
    return { player, sent, onEnded, onLoadedMetadata, onTimeUpdate };
}

describe("createYouTubePlayer", () => {
    it("starts loading, with nothing a viewer could choose between", () => {
        const { player } = make();
        expect(player.state.lifecycle).toBe("loading");
        expect(player.state.angles).toEqual([]);
        expect(player.state.audioTracks).toEqual([]);
        expect(player.state.subtitleTracks).toEqual([]);
        expect(player.state.thumbnailsReady).toBe(false);
    });

    it("becomes ready, and says how much is loaded in seconds", () => {
        const { player, onLoadedMetadata } = make();
        player.receive(report({ type: "ready", status: -1 }));
        expect(player.state.lifecycle).toBe("ready");

        player.receive(report({ status: 1, currentTime: 10, duration: 200, loaded: 0.25 }));
        expect(player.state.bufferedEnd).toBe(50);
        expect(onLoadedMetadata).toHaveBeenCalledTimes(1);
        player.receive(report({ status: 1, currentTime: 11, duration: 200 }));
        expect(onLoadedMetadata).toHaveBeenCalledTimes(1);
    });

    it("counts buffering as playing, and as stalled", () => {
        const { player } = make();
        player.receive(report({ status: 3 }));
        expect(player.state.playing).toBe(true);
        expect(player.state.stalled).toBe(true);

        player.receive(report({ status: 2 }));
        expect(player.state.playing).toBe(false);
        expect(player.state.stalled).toBe(false);
    });

    it("reports the end once, and again after it plays on", () => {
        const { player, onEnded } = make();
        player.receive(report({ status: 0 }));
        player.receive(report({ status: 0 }));
        expect(onEnded).toHaveBeenCalledTimes(1);
        expect(player.state.ended).toBe(true);

        player.receive(report({ status: 1 }));
        player.receive(report({ status: 0 }));
        expect(onEnded).toHaveBeenCalledTimes(2);
    });

    it("keeps the time from a time report without touching what is playing", () => {
        const { player } = make();
        player.receive(report({ status: 2 }));
        player.receive(report({ type: "time", status: 1, currentTime: 5, duration: 100 }));
        expect(player.state.currentTime).toBe(5);
        expect(player.state.playing).toBe(false);
    });

    it("stays in error once YouTube has failed", () => {
        const { player } = make();
        player.receive(report({ type: "error", code: 153 }));
        player.receive(report({ status: 1, currentTime: 3, duration: 100 }));
        expect(player.state.lifecycle).toBe("error");
        expect(player.state.error?.message).toContain("refused");
    });

    it("sends commands, and moves the bar at once on a seek", () => {
        const { player, sent } = make();
        player.seek(42);
        player.setMuted(false);
        expect(player.state.currentTime).toBe(42);
        expect(sent).toEqual([
            { src: "lmc-yt", cmd: "seek", value: 42 },
            { src: "lmc-yt", cmd: "unmute" },
        ]);
    });

    it("recognises only its own reports", () => {
        expect(isYouTubeReport({ src: "lmc-yt", type: "ready" })).toBe(true);
        expect(isYouTubeReport({ type: "ready" })).toBe(false);
        expect(isYouTubeReport(null)).toBe(false);
        expect(isYouTubeReport("lmc-yt")).toBe(false);
    });
});
