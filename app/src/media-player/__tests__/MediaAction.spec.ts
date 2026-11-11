import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { mockEnglishContentDto } from "@/tests/mockdata";
import { removeMediaProgress, setMediaProgress } from "@/contentProgress";
import { PLAYER_ICONS } from "../playerIcons";
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
        // The player's own play glyph, drawn into the button's one drawing.
        expect(play.find("[data-test='mediaPlayDisc'] path").attributes("d")).toBe(
            PLAYER_ICONS.play[0]!.path,
        );

        await play.trigger("click");
        expect(mediaPlayerView.value).toBe("expanded");
    });

    it("sits on no background of its own", () => {
        const play = mountAction(true).find("[data-test='mediaPlay']");
        expect(play.classes().some((c) => /^(dark:)?bg-/.test(c))).toBe(false);
    });

    it("squishes the whole button, ring and progress too, while pressed, unless motion is reduced", async () => {
        setMediaProgress(videoUrl, mockEnglishContentDto._id, 300, 1200);
        const wrapper = mountAction(true);
        const play = wrapper.find("[data-test='mediaPlay']");
        const drawing = () => wrapper.find("[data-test='mediaPlayProgress']");
        expect(drawing().classes()).not.toContain("motion-safe:scale-[0.92]");
        // The ring and the progress are in the drawing that squishes.
        expect(drawing().find("[data-test='mediaPlayArc']").exists()).toBe(true);

        await play.trigger("pointerdown");
        expect(drawing().classes()).toContain("motion-safe:scale-[0.92]");
        // The button itself keeps its size, so the press stays on it.
        expect(play.classes()).not.toContain("motion-safe:scale-[0.92]");

        await play.trigger("pointerup");
        expect(drawing().classes()).not.toContain("motion-safe:scale-[0.92]");

        await play.trigger("pointerdown");
        await play.trigger("pointercancel");
        expect(drawing().classes()).not.toContain("motion-safe:scale-[0.92]");
    });

    it("is one vector drawing, with nothing the browser would rasterise at rest", () => {
        const play = mountAction(true).find("[data-test='mediaPlay']");
        expect(play.findAll("svg")).toHaveLength(1);
        const classes = play.findAll("*").flatMap((el) => el.classes());
        expect(
            classes.filter((c) => /(drop-shadow|^shadow-|^ring-|rotate-|scale-)/.test(c)),
        ).toEqual([]);
        // The progress starts at the top by the drawing's own rotation.
        setMediaProgress(videoUrl, mockEnglishContentDto._id, 300, 1200);
        expect(mountAction(true).find("[data-test='mediaPlayArc']").attributes("transform")).toBe(
            "rotate(-90 34 34)",
        );
    });

    it("shows the ring's track, with no progress on it, before the video is started", () => {
        const wrapper = mountAction(true);
        expect(wrapper.find("[data-test='mediaPlayTrack']").exists()).toBe(true);
        expect(wrapper.find("[data-test='mediaPlayArc']").exists()).toBe(false);
    });

    it("gives the ring a soft halo in both themes, lighter in light so it shows no dark band", () => {
        const ring = mountAction(true).find("[data-test='mediaPlayProgress']");
        const halo = ring.findAll("circle")[0]!;
        expect(halo.classes()).toEqual(
            expect.arrayContaining(["stroke-black/25", "dark:stroke-black/60"]),
        );
        expect(halo.attributes("filter")).toMatch(/^url\(#.+-halo\)$/);
        expect(ring.findAll("filter")).toHaveLength(2);
    });

    it("draws the progress in mustard over a light track, and the brownish yellow over a slate one in dark", () => {
        setMediaProgress(videoUrl, mockEnglishContentDto._id, 300, 1200);
        const wrapper = mountAction(true);
        const progress = wrapper.find("[data-test='mediaPlayArc']");
        expect(progress.classes()).toEqual(["stroke-yellow-600", "dark:stroke-yellow-700"]);
        expect(wrapper.find("[data-test='mediaPlayTrack']").classes()).toEqual(
            expect.arrayContaining(["stroke-zinc-200", "dark:stroke-slate-700"]),
        );
    });

    it("outlines the disc in both themes, with a shadow, right up to the ring with no gap", async () => {
        const wrapper = mountAction(true);
        const outline = wrapper.find("[data-test='mediaPlayOutline']");
        // The ring's inner edge: radius 31 less half its 5 stroke.
        expect(outline.attributes("r")).toBe("28.5");
        expect(outline.classes()).toEqual(["fill-zinc-900"]);
        expect(outline.attributes("filter")).toMatch(/-shadow\)$/);
        const disc = wrapper.findAll("[data-test='mediaPlayDisc'] circle")[1]!;
        expect(disc.attributes("r")).toBe("25.5");
        expect(disc.classes()).toEqual(["fill-yellow-500"]);
    });

    it("centres the triangle by the circle around it, not by its box", () => {
        const glyph = mountAction(true).find("[data-test='mediaPlayDisc'] path");
        const [, tx, ty, scale] = glyph
            .attributes("transform")!
            .match(/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/)!
            .map(Number);
        // The play glyph's enclosing circle is centred at (7.43, 9) on its 18-unit grid.
        expect(tx! + 7.43 * scale!).toBeCloseTo(34, 2);
        expect(ty! + 9 * scale!).toBeCloseTo(34, 2);
    });

    it("rings the button with how far the video was watched", async () => {
        setMediaProgress(videoUrl, mockEnglishContentDto._id, 300, 1200);
        const wrapper = mountAction(true);
        const arc = () => wrapper.find("[data-test='mediaPlayArc']");
        expect(arc().attributes("stroke-dasharray")).toBe("25 100");

        setMediaProgress(videoUrl, mockEnglishContentDto._id, 900, 1200);
        await wrapper.vm.$nextTick();
        expect(arc().attributes("stroke-dasharray")).toBe("75 100");
    });

    it("uses the player's play icon under the title too", () => {
        const wrapper = mountAction();
        expect(wrapper.find("[data-test='mediaPlay'] [data-test='playerIcon']").exists()).toBe(
            true,
        );
    });
});
