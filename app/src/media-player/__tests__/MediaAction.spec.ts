import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { removeMediaProgress, setMediaProgress } from "@/contentProgress";
import MediaAction from "../MediaAction.vue";
import { mediaPlayerItem, mediaPlayerView } from "../mediaPlayer";

const i18n = createI18n({
    legacy: false,
    locale: "eng",
    messages: { eng: { "media_player.play": "Play" } },
});

const videoUrl = mockEnglishContentDto.parentMedia!.hlsUrl!;

const mountAction = (corner = false) =>
    mount(MediaAction, {
        props: { content: mockEnglishContentDto, language: "eng", corner },
        global: { plugins: [i18n] },
    });

describe("MediaAction", () => {
    beforeEach(() => {
        mediaPlayerItem.value = null;
        mediaPlayerView.value = "mini";
    });

    it("is one Play button under the title, and opens the media player on the content", async () => {
        const wrapper = mountAction();
        const play = wrapper.find("[data-test='mediaPlay']");
        expect(play.text()).toBe("Play");

        await play.trigger("click");
        expect(mediaPlayerItem.value?.content._id).toBe(mockEnglishContentDto._id);
        expect(mediaPlayerItem.value?.language).toBe("eng");
        // Sound or picture is the player's choice (Data Saver), switched there.
        expect(mediaPlayerItem.value?.audio).toBeUndefined();
        expect(mediaPlayerView.value).toBe("expanded");
    });

    afterEach(() => {
        removeMediaProgress(videoUrl, mockEnglishContentDto._id);
    });

    it("hangs over the picture's bottom-right edge as a round button named Play", async () => {
        const wrapper = mountAction(true);
        const play = wrapper.find("[data-test='mediaPlay']");
        expect(play.classes()).toEqual(
            expect.arrayContaining(["absolute", "-bottom-[34px]", "right-3.5", "rounded-full"]),
        );
        expect(play.attributes("aria-label")).toBe("Play");
        expect(play.find("[data-test='playerIcon']").exists()).toBe(true);

        await play.trigger("click");
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("sits on no background of its own", () => {
        const play = mountAction(true).find("[data-test='mediaPlay']");
        expect(play.classes().some((c) => /^(dark:)?bg-/.test(c))).toBe(false);
    });

    it("shows the ring's track, with no progress on it, before the video is started", () => {
        const ring = mountAction(true).find("[data-test='mediaPlayProgress']");
        expect(ring.exists()).toBe(true);
        expect(ring.findAll("circle")).toHaveLength(1);
    });

    it("scales down while pressed and back on release, unless motion is reduced", async () => {
        const play = mountAction(true).find("[data-test='mediaPlay']");
        expect(play.classes()).not.toContain("motion-safe:scale-[0.92]");

        await play.trigger("pointerdown");
        expect(play.classes()).toContain("motion-safe:scale-[0.92]");

        await play.trigger("pointerup");
        expect(play.classes()).not.toContain("motion-safe:scale-[0.92]");

        await play.trigger("pointerdown");
        await play.trigger("pointercancel");
        expect(play.classes()).not.toContain("motion-safe:scale-[0.92]");
    });

    it("rings the button with how far the video was watched", async () => {
        setMediaProgress(videoUrl, mockEnglishContentDto._id, 300, 1200);
        const wrapper = mountAction(true);

        const ring = wrapper.find("[data-test='mediaPlayProgress']");
        expect(ring.exists()).toBe(true);
        expect(ring.findAll("circle")[1].attributes("stroke-dasharray")).toBe("25 100");

        setMediaProgress(videoUrl, mockEnglishContentDto._id, 900, 1200);
        await wrapper.vm.$nextTick();
        expect(ring.findAll("circle")[1].attributes("stroke-dasharray")).toBe("75 100");
    });

    it("uses the player's play icon under the title too", () => {
        const wrapper = mountAction();
        expect(wrapper.find("[data-test='mediaPlay'] [data-test='playerIcon']").exists()).toBe(
            true,
        );
    });
});
