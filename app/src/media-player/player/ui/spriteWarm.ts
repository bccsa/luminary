import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";

/** Sheets fetched at once while warming, so the warm never crowds out the video's own segments. */
export const SPRITE_WARM_CONCURRENCY = 2;

/** Sheets each side of the playhead's own fetched first, once playback has a little buffer. */
export const SPRITE_WARM_WINDOW = 3;

/** Seconds buffered ahead before the window around the playhead is fetched. */
export const SPRITE_WARM_WINDOW_BUFFER_S = 10;

/** Seconds buffered ahead before the rest of the video's sheets are fetched. */
export const SPRITE_WARM_ALL_BUFFER_S = 30;

/**
 * Every sprite sheet of a video, each once, nearest `around` first: the order a viewer is likely to
 * scrub them in. Walks the cues through `thumbnailAt`, cue end to cue end.
 */
export function spriteSheetsByDistance(
    thumbnailAt: (seconds: number) => ThumbnailSpriteCue | null,
    duration: number,
    around: number,
): string[] {
    if (!(duration > 0)) return [];
    const nearest = new Map<string, number>();
    let time = 0;
    while (time < duration) {
        const cue = thumbnailAt(time);
        if (!cue || !(cue.endTime > time)) {
            time += 1;
            continue;
        }
        const distance =
            around < cue.startTime ? cue.startTime - around : Math.max(0, around - cue.endTime);
        const known = nearest.get(cue.spriteUrl);
        if (known === undefined || distance < known) nearest.set(cue.spriteUrl, distance);
        time = cue.endTime;
    }
    return [...nearest.entries()].sort((a, b) => a[1] - b[1]).map(([url]) => url);
}

/** What the warm is allowed to fetch now, judged from playback. */
export interface SpriteWarmPlayback {
    /** Whether the video has started playing since it was loaded. */
    started: boolean;
    stalled: boolean;
    currentTime: number;
    bufferedEnd: number;
    duration: number;
}

/**
 * How many of the nearest-first sheets may be fetched now. None until playback has started and has some
 * buffer, and none while it is stalled, so the warm never competes with the start of a video or a
 * rebuffer: the window around the playhead once there is a little buffer, all once there is plenty.
 */
export function spriteWarmLimit(playback: SpriteWarmPlayback): number {
    const { started, stalled, currentTime, bufferedEnd, duration } = playback;
    if (!started || stalled) return 0;
    const ahead = bufferedEnd - currentTime;
    const toEnd = duration > 0 && bufferedEnd >= duration - 0.5;
    if (toEnd || ahead >= SPRITE_WARM_ALL_BUFFER_S) return Infinity;
    if (ahead >= SPRITE_WARM_WINDOW_BUFFER_S) return 1 + 2 * SPRITE_WARM_WINDOW;
    return 0;
}

/**
 * Loads sprite sheets into the browser's image cache a few at a time, so a frame is on screen the moment
 * the pointer reaches it. `setSheets` gives the order (nearest the playhead first) and `setLimit` how far
 * down it may go; both can change at any time, and a lowered limit stops new fetches without dropping
 * those done.
 */
export class SpriteWarmer {
    private queue: string[] = [];
    private limit = 0;
    /** Sheets already asked for, loaded or not. */
    private readonly done = new Set<string>();
    private readonly inFlight = new Map<string, () => void>();
    /** Loaded sheets, held so the browser keeps them decoded in its memory cache. */
    private kept: unknown[] = [];
    private stopped = false;

    constructor(
        private readonly load: (url: string, signal: AbortSignal) => Promise<unknown> = loadImage,
        private readonly concurrency = SPRITE_WARM_CONCURRENCY,
    ) {}

    /** The sheets, nearest the playhead first. */
    setSheets(urls: string[]): void {
        this.queue = urls;
        this.pump();
    }

    /** How many of the sheets, counted from the nearest, may be fetched. */
    setLimit(limit: number): void {
        this.limit = limit;
        this.pump();
    }

    /** Abandons the queue and aborts the sheets still loading. */
    stop(): void {
        this.stopped = true;
        for (const abort of this.inFlight.values()) abort();
        this.inFlight.clear();
        this.kept = [];
    }

    private pump(): void {
        if (this.stopped) return;
        const allowed = this.queue.slice(0, this.limit);
        for (const url of allowed) {
            if (this.inFlight.size >= this.concurrency) return;
            if (this.done.has(url) || this.inFlight.has(url)) continue;
            this.done.add(url);
            const controller = new AbortController();
            this.inFlight.set(url, () => controller.abort());
            void this.load(url, controller.signal)
                .then(
                    (loaded) => void this.kept.push(loaded),
                    // A failed sheet is left to load when a frame on it is drawn, not retried here.
                    () => undefined,
                )
                .finally(() => {
                    if (!this.inFlight.delete(url)) return;
                    this.pump();
                });
        }
    }
}

/** Loaded at low priority, so the video's own requests go first. */
function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        (image as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
        image.onload = () => resolve(image);
        image.onerror = reject;
        signal.addEventListener("abort", () => {
            image.onload = image.onerror = null;
            // An empty source cancels the request.
            image.src = "";
            reject(new Error("aborted"));
        });
        image.src = url;
    });
}
