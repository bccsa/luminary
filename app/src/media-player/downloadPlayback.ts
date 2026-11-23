import type {
    DownloadBadge,
    DownloadEntry,
    DownloadPlaybackCloseReason,
    DownloadSelection,
    DownloadTimeline,
} from "@/build-time/contracts/downloads/contract";
import type {
    VideoChapter,
    VideoNowPlayingDownload,
} from "@/build-time/contracts/video-player/contract";

/**
 * Whether the download holds the part of the item at `fullTime`: the chapter there, or the whole item when it has no
 * chapters, has units and all of them are done.
 */
export function holdsPosition(entry: DownloadEntry, fullTime: number): boolean {
    const done = (unitIds: readonly string[]) =>
        unitIds.length > 0 &&
        unitIds.every((id) => entry.units.find((unit) => unit.unitId === id)?.state === "done");
    if (!entry.chapters.length) return done(entry.units.map((unit) => unit.unitId));
    const last = entry.chapters.length - 1;
    const chapter = entry.chapters.find(
        (c, i) => fullTime >= c.startTime && (fullTime < c.endTime || i === last),
    );
    return !!chapter && done(chapter.unitIds);
}

/**
 * Whether the download holds anything of the item after `fullTime`. A second's tolerance, as the end detector allows:
 * a position converted back from the download's own timeline can fall a rounding step short of a span's end.
 */
export function holdsMaterialAfter(timeline: DownloadTimeline, fullTime: number): boolean {
    return timeline.spans.some((span) => span.fullEnd - fullTime > 1);
}

/** The entry's chapters on the download's timeline, for the player's list; undefined for an item without chapters. */
export function downloadChapters(
    entry: DownloadEntry | undefined,
    timeline: DownloadTimeline,
): VideoChapter[] | undefined {
    if (!entry?.chapters.length) return undefined;
    return entry.chapters.map((chapter) => ({
        title: chapter.title,
        ...timeline.chapter(chapter),
    }));
}

/** The text key, and its English, of what the viewer is told when the engine stops a session itself. */
export function closedNoticeKey(
    reason: DownloadPlaybackCloseReason,
): [key: string, english: string] {
    return reason === "volume-unavailable"
        ? [
              "downloads.notice.volume_unavailable",
              "The storage card holding this download was removed.",
          ]
        : ["downloads.notice.revoked", "This download is no longer available."];
}

/** The download tool of a platform's now-playing screen, from the item's badge and the copy that plays. */
export function nowPlayingDownload(
    badge: DownloadBadge,
    source: "downloaded" | "online" | undefined,
    canPlayOnline: boolean,
    disabled = false,
): VideoNowPlayingDownload {
    return {
        badge: badge.state,
        ...(badge.state === "progress" ? { percent: badge.percent } : {}),
        ...(source ? { source } : {}),
        canPlayOnline,
        ...(disabled ? { disabled: true } : {}),
    };
}

/** What plays, as the hint the download sheet preselects from. */
export function selectionOf(playing: {
    audioOnly: boolean;
    angleId?: string | null;
    height?: number;
    audioLanguage?: string;
}): Partial<DownloadSelection> {
    if (playing.audioOnly) {
        return {
            kind: "audio",
            ...(playing.audioLanguage ? { audioLanguage: playing.audioLanguage } : {}),
        };
    }
    return {
        kind: "video",
        ...(playing.angleId ? { angleId: playing.angleId } : {}),
        // A quality id is the rendition's height.
        ...(playing.height ? { qualityId: String(playing.height) } : {}),
        ...(playing.audioLanguage ? { audioLanguage: playing.audioLanguage } : {}),
    };
}
