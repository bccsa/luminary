import { beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled } from "@/globalConfig";
import {
    closeMediaPlayer,
    expandMediaPlayer,
    mediaPlayerItem,
    mediaPlayerView,
    minimiseMediaPlayer,
    openMediaPlayer,
    opensAsAudio,
    chosenAudio,
    sleepTimerDefault,
    startsAsAudio,
} from "../mediaPlayer";

const other = { ...mockEnglishContentDto, _id: "content-other" };

beforeEach(() => {
    closeMediaPlayer();
    userDataSaverEnabled.value = false;
    chosenAudio.value = null;
});

describe("the media player's store", () => {
    it("opens full on the content played", () => {
        openMediaPlayer(mockEnglishContentDto, "en");

        expect(mediaPlayerItem.value?.content._id).toBe(mockEnglishContentDto._id);
        expect(mediaPlayerItem.value?.language).toBe("en");
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("reopens the content already playing rather than starting it again", () => {
        openMediaPlayer(mockEnglishContentDto, "en");
        const playing = mediaPlayerItem.value;
        minimiseMediaPlayer();

        openMediaPlayer(mockEnglishContentDto, "en");

        expect(mediaPlayerItem.value).toBe(playing);
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("replaces the item when other content is played", () => {
        openMediaPlayer(mockEnglishContentDto, "en");
        openMediaPlayer(other, "en");

        expect(mediaPlayerItem.value?.content._id).toBe("content-other");
    });

    it("minimises and expands only while something plays", () => {
        minimiseMediaPlayer();
        expect(mediaPlayerView.value).toBe("expanded");

        openMediaPlayer(mockEnglishContentDto, "en");
        minimiseMediaPlayer();
        expect(mediaPlayerView.value).toBe("mini");
        expandMediaPlayer();
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("closes, and the next item opens full again", () => {
        openMediaPlayer(mockEnglishContentDto, "en");
        minimiseMediaPlayer();
        closeMediaPlayer();

        expect(mediaPlayerItem.value).toBeNull();
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("starts as audio while Data Saver is on", () => {
        expect(startsAsAudio.value).toBe(false);
        userDataSaverEnabled.value = true;
        expect(startsAsAudio.value).toBe(true);
    });

    it("opens as asked, else as last chosen; strict Data Saver opens as sound only until a mode is chosen", () => {
        expect(opensAsAudio({})).toBe(false);
        userDataSaverEnabled.value = true;
        expect(opensAsAudio({})).toBe(true);
        chosenAudio.value = false;
        expect(opensAsAudio({})).toBe(false);
        expect(opensAsAudio({ audio: true })).toBe(true);
        userDataSaverEnabled.value = false;
        expect(opensAsAudio({})).toBe(false);
        chosenAudio.value = true;
        expect(opensAsAudio({})).toBe(true);
        expect(opensAsAudio({ audio: false })).toBe(false);
    });

    it("keeps the last sleep timer chosen, off included", async () => {
        sleepTimerDefault.value = { kind: "minutes", minutes: 15 };
        await nextTick();
        expect(JSON.parse(localStorage.getItem("mediaPlayerSleepTimer")!)).toEqual({ kind: "minutes", minutes: 15 });
        sleepTimerDefault.value = null;
        await nextTick();
        expect(localStorage.getItem("mediaPlayerSleepTimer")).toBeNull();
    });

    it("keeps the viewer's choice of mode across restarts", async () => {
        chosenAudio.value = false;
        await nextTick();
        expect(localStorage.getItem("mediaPlayerMode")).toBe("video");
        chosenAudio.value = true;
        await nextTick();
        expect(localStorage.getItem("mediaPlayerMode")).toBe("audio");
        chosenAudio.value = null;
        await nextTick();
        expect(localStorage.getItem("mediaPlayerMode")).toBeNull();
    });
});
