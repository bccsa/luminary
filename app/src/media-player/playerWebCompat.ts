import { defineComponent, h } from "vue";

export type ScrubPosition = {
    time: number;
    markerX: number;
    width: number;
    bottom: number;
    held?: boolean;
};

export const AUDIO_ONLY_ANGLE_ID = "__audio__";

export function mergeMessages<T extends Record<string, unknown>>(messages: T): T {
    return messages;
}

export function chapterSegments(
    chapters: Array<{ startTime: number; endTime: number; title: string }>,
    duration: number,
) {
    return chapters.map((chapter, index) => ({
        index,
        in: chapter.startTime,
        out: Math.min(chapter.endTime, duration > 0 ? duration : chapter.endTime),
        title: chapter.title,
    }));
}

export function chapterMask(segments: Array<{ in: number; out: number }>): string {
    return segments.map((segment) => `${segment.in}:${segment.out}`).join(" ");
}

export function rosterStep(_duration: number): number {
    return 4;
}

export function rosterFineStep(_duration: number): number {
    return 1;
}

export function rosterTiles(
    time: number,
    markerX: number,
    width: number,
    tileWidth: number,
    step: number,
    duration: number,
): Array<{ index: number; left: number; time: number }> {
    if (!width || !duration) return [];
    const tiles: Array<{ index: number; left: number; time: number }> = [];
    const safeStep = Math.max(1, step || 1);
    const count = Math.max(1, Math.ceil(duration / safeStep));
    for (let index = 0; index < count; index++) {
        const tileTime = index * safeStep;
        const ratio = duration > 0 ? tileTime / duration : 0;
        const left = Math.min(
            width - tileWidth,
            Math.max(0, ratio * width - tileWidth / 2 + markerX),
        );
        tiles.push({ index, left, time: time + (tileTime - time) });
    }
    return tiles;
}

export const ScrubPicture = defineComponent({
    name: "ScrubPicture",
    props: {
        cue: Object,
    },
    setup() {
        return () => h("div", { "data-test": "scrubPicture" });
    },
});

export const ScrubRoster = defineComponent({
    name: "ScrubRoster",
    props: {
        tiles: { type: Array, default: () => [] },
        markerX: Number,
        interactive: Boolean,
        closeLabel: String,
        height: Number,
        bottom: Number,
        tileWidth: Number,
    },
    emits: ["close"],
    setup(props, { emit }) {
        return () =>
            h(
                "div",
                {
                    "data-test": "scrubRoster",
                    "data-tiles": props.tiles?.length,
                    style: { height: `${props.height ?? 0}px` },
                },
                [
                    props.interactive
                        ? h(
                              "button",
                              {
                                  "data-test": "mediaPlayerRosterClose",
                                  onClick: () => emit("close"),
                              },
                              props.closeLabel ?? "Close",
                          )
                        : null,
                ],
            );
    },
});

export const AudioFullscreen = defineComponent({
    name: "AudioFullscreen",
    props: {
        title: String,
        subtitle: String,
        artwork: { type: Object as any, default: undefined },
        playing: Boolean,
        busy: Boolean,
        live: Boolean,
        currentTime: Number,
        duration: Number,
        bufferedEnd: Number,
        chapterIndex: Number,
        playbackRate: Number,
        chaptersSheet: Boolean,
        hasBrowse: Boolean,
        appearance: String,
        stage: String,
        fill: Boolean,
        stageHole: Boolean,
        captionBand: Boolean,
        wash: String,
        subtitleTracks: { type: Array as any, default: () => [] },
        activeSubtitleTrackId: { type: [String, null] as any, default: null },
        canPictureInPicture: Boolean,
        lyrics: { type: Array as any, default: () => [] },
        exitLabel: String,
        fullscreenTool: Boolean,
        fullscreenActive: Boolean,
        skipBackSeconds: Number,
        skipForwardSeconds: Number,
        chapterMask: String,
    },
    emits: [
        "exit",
        "toggle-play",
        "seek",
        "rate",
        "seek-chapter",
        "upnextselect",
        "subtitle-track",
        "picture-in-picture",
        "fullscreen",
    ],
    setup(props, { slots }) {
        return () =>
            h("div", { "data-test": "audioFullscreenStub" }, [
                h("div", { class: "lmpl-afs-top", "data-test": "audioFullscreenTop" }, [
                    slots["top-end"]?.(),
                ]),
                props.title ? h("h2", { class: "title" }, props.title) : null,
                props.subtitle ? h("div", { class: "subtitle" }, props.subtitle) : null,
                slots["under-title"]?.(),
                slots.sheet?.({ close: () => {} }),
                slots["audio-tool"]?.(),
                slots.cast?.(),
                slots.roster?.(),
                h("div", { "data-test": "audioFullscreenStage" }, [slots.stage?.()]),
            ]);
    },
});
