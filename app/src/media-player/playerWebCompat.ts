import { defineComponent, h } from "vue";
import {
    chapterIndexAt,
    chapterMask,
    chapterSegments,
    rosterFineStep,
    rosterStep,
    rosterTiles,
} from "./playerCompat";

export { chapterIndexAt, chapterMask, chapterSegments, rosterFineStep, rosterStep, rosterTiles };
export const AUDIO_ONLY_ANGLE_ID = "__audio__";

export const mergeMessages = <T extends Record<string, unknown>>(messages: T): T => messages;

export const ScrubPicture = defineComponent({
    name: "ScrubPicture",
    props: {
        cue: { type: null as any, default: null },
    },
    setup() {
        return () => h("div", { "data-test": "scrubPicture" });
    },
});

export const ScrubRoster = defineComponent({
    name: "ScrubRoster",
    props: {
        tiles: { type: Array as any, default: () => [] },
        tileWidth: Number,
        height: Number,
        markerX: Number,
        bottom: Number,
        width: Number,
        interactive: Boolean,
        closeLabel: String,
    },
    emits: {
        close: () => true,
    },
    setup(props, { emit }) {
        return () =>
            h(
                "div",
                {
                    "data-test": "scrubRoster",
                    "data-tiles": props.tiles?.length,
                },
                props.interactive
                    ? [
                          h(
                              "button",
                              {
                                  "data-test": "mediaPlayerRosterClose",
                                  onClick: () => emit("close"),
                              },
                              props.closeLabel ?? "Close",
                          ),
                      ]
                    : [],
            );
    },
});

export const AudioFullscreen = defineComponent({
    name: "AudioFullscreen",
    props: {
        title: { type: String as any, default: undefined },
        subtitle: { type: String as any, default: undefined },
        artwork: { type: null as any, default: null },
        playing: { type: Boolean as any, default: false },
        busy: { type: Boolean as any, default: false },
        live: { type: Boolean as any, default: false },
        currentTime: { type: Number as any, default: 0 },
        duration: { type: Number as any, default: 0 },
        bufferedEnd: { type: Number as any, default: 0 },
        chapterIndex: { type: Number as any, default: 0 },
        playbackRate: { type: Number as any, default: 1 },
        qualities: { type: Array as any, default: () => [] },
        activeQualityId: { type: null as any, default: null },
        audioTracks: { type: Array as any, default: () => [] },
        activeAudioTrackId: { type: null as any, default: null },
        sleepTimer: { type: null as any, default: null },
        hasBrowse: { type: Boolean as any, default: false },
        upNext: { type: Array as any, default: () => [] },
        chaptersSheet: { type: Boolean as any, default: false },
        skipBackSeconds: { type: Number as any, default: 0 },
        skipForwardSeconds: { type: Number as any, default: 0 },
        chapterMask: { type: String as any, default: undefined },
        thumbnailAt: { type: Number as any, default: undefined },
        messages: { type: null as any, default: null },
        subtitleTracks: { type: Array as any, default: () => [] },
        activeSubtitleTrackId: { type: null as any, default: null },
        canPictureInPicture: { type: Boolean as any, default: false },
        fullscreenTool: { type: Boolean as any, default: false },
        fullscreenActive: { type: Boolean as any, default: false },
        lyrics: { type: Array as any, default: () => [] },
    },
    emits: {
        exit: () => true,
        "toggle-play": () => true,
        seek: (time: number) => typeof time === "number",
        sleep: (option: any) => true,
        rate: (rate: number) => typeof rate === "number",
        "seek-chapter": (chapter: any) => !!chapter,
        upnextselect: (id: string) => typeof id === "string",
        "subtitle-track": (id: string) => typeof id === "string",
        "audio-track": (id: string) => typeof id === "string",
        quality: (id: string) => typeof id === "string",
        "picture-in-picture": () => true,
        fullscreen: () => true,
        scrub: (position: any) => !!position,
        covered: (covered: boolean) => typeof covered === "boolean",
        stagechange: () => true,
    },
    setup(props, { slots }) {
        return () =>
            h("div", { "data-test": "audioFullscreenStub" }, [
                h("div", { class: "lmpl-afs-top", "data-test": "audioFullscreenTop" }, [
                    slots["top-end"]?.(),
                ]),
                props.title,
                slots["under-title"]?.(),
                slots.sheet?.({ close: () => {} }),
                slots["audio-tool"]?.(),
                slots.cast?.(),
                slots.roster?.(),
                h("div", { "data-test": "audioFullscreenStage" }, [slots.stage?.()]),
            ]);
    },
});
