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
    props: { cue: Object },
    setup() {
        return () => h("div", { "data-test": "scrubPicture" });
    },
});

export const ScrubRoster = defineComponent({
    name: "ScrubRoster",
    props: {
        tiles: Array,
        markerX: Number,
        interactive: Boolean,
        closeLabel: String,
    },
    emits: ["close"],
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
        title: String,
        subtitle: String,
        artwork: Object,
        playing: Boolean,
        busy: Boolean,
        live: Boolean,
        currentTime: Number,
        hasBrowse: Boolean,
        chaptersSheet: Boolean,
        fullscreenTool: Boolean,
        fullscreenActive: Boolean,
        appearance: String,
        stage: String,
        fill: Boolean,
        stageHole: Boolean,
        captionBand: Boolean,
        wash: String,
        exitLabel: String,
        subtitleTracks: Array,
        activeSubtitleTrackId: String,
        canPictureInPicture: Boolean,
        lyrics: Array,
    },
    emits: [
        "exit",
        "toggle-play",
        "seek",
        "sleep",
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
