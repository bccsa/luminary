export type Chapter = {
    startTime: number;
    endTime: number;
    title: string;
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

export function chapterIndexAt(chapters: Chapter[], time: number): number {
    let index = -1;
    for (let i = 0; i < chapters.length; i++) {
        if (chapters[i].startTime <= time) index = i;
        else break;
    }
    return index;
}
