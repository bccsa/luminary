import type { ThumbnailSpriteCue } from "@luminary-media-converter/player-web";

/** Sheets fetched at once while warming, so the warm never crowds out the video's own segments. */
export const SPRITE_WARM_CONCURRENCY = 2;

/**
 * Every sprite sheet of a video, each once, nearest `around` first: the order a viewer is likely to scrub
 * them in. Walks the cues through `thumbnailAt`, cue end to cue end.
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

/**
 * Loads `urls` a few at a time into the browser's image cache, so a frame is on screen the moment the
 * pointer reaches it instead of waiting behind the video's segment downloads. The images are held until
 * `stop`, which also abandons the rest of the queue.
 */
export function warmSpriteSheets(
    urls: string[],
    load?: (url: string) => Promise<unknown>,
    concurrency = SPRITE_WARM_CONCURRENCY,
): { stop: () => void; done: Promise<void> } {
    let stopped = false;
    // Held until stop so the decoded sheets are not dropped from the memory cache.
    const held: HTMLImageElement[] = [];
    load ??= (url) => loadImage(url, held);
    const queue = [...urls];
    const worker = async () => {
        while (!stopped && queue.length > 0) {
            await load!(queue.shift()!).catch(() => undefined);
        }
    };
    const done = Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, worker),
    ).then(() => undefined);
    return {
        stop: () => {
            stopped = true;
            held.length = 0;
        },
        done,
    };
}

function loadImage(url: string, held: HTMLImageElement[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = url;
        held.push(image);
    });
}
