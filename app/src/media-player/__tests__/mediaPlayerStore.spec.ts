import { beforeEach, describe, expect, it } from "vitest";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { userDataSaverEnabled } from "@/globalConfig";
import {
    closeMediaPlayer,
    expandMediaPlayer,
    mediaPlayerItem,
    mediaPlayerView,
    minimiseMediaPlayer,
    openMediaPlayer,
    startsAsAudio,
} from "../mediaPlayer";

const other = { ...mockEnglishContentDto, _id: "content-other" };

beforeEach(() => {
    closeMediaPlayer();
    userDataSaverEnabled.value = false;
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
});
