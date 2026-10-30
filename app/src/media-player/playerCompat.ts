export type Chapter = {
    title: string;
    startTime: number;
    endTime: number;
    [key: string]: unknown;
};

export type ThumbnailSpriteCue = {
    spriteUrl: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

export type PlayerUpNextItem = {
    id: string;
    title: string;
    section?: string;
    subtitle?: string;
    current?: boolean;
    imageUrl?: string;
    imageSrcset?: string;
    fallbackImageUrl?: string;
};

export type ScrubPosition = {
    time: number;
    markerX: number;
    width: number;
    bottom: number;
    held?: boolean;
};

export function chapterIndexAt(chapters: Chapter[], time: number): number {
    return chapters.reduce(
        (found, chapter, index) => (chapter.startTime <= time ? index : found),
        -1,
    );
}

export function chapterSegments(chapters: Chapter[], duration: number) {
    const next: { start: number; end: number }[] = [];
    for (const chapter of chapters) {
        next.push({ start: chapter.startTime, end: Math.min(chapter.endTime, duration) });
    }
    return next;
}

export function chapterMask(segments: { start: number; end: number }[]): string {
    if (!segments.length) return "";
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const marks = sorted.map((segment) => `${segment.start}:${segment.end}`).join(",");
    return marks;
}

export function rosterStep(duration: number): number {
    if (!(duration > 0)) return 4;
    return Math.max(4, Math.min(30, Math.round(duration / 18)));
}

export function rosterFineStep(duration: number): number {
    if (!(duration > 0)) return 1;
    return Math.max(1, Math.min(8, Math.round(duration / 120)));
}

export function rosterTiles(
    time: number,
    markerX: number,
    width: number,
    tileWidth: number,
    step: number,
    duration: number,
): Array<{ index: number; left: number; time: number }> {
    if (!(width > 0) || !(tileWidth > 0) || !(duration > 0) || !(step > 0)) {
        return [];
    }

    const start = Math.max(0, time - step * 3);
    const end = Math.min(duration, time + step * 3);
    const tiles: Array<{ index: number; left: number; time: number }> = [];
    for (let cursor = start; cursor <= end; cursor += step) {
        const ratio = duration > 0 ? cursor / duration : 0;
        const left = Math.max(0, Math.min(width - tileWidth, markerX + (ratio - 0.5) * width));
        tiles.push({ index: tiles.length, left, time: cursor });
    }
    return tiles;
}
