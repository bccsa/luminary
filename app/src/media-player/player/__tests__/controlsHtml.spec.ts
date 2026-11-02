import { describe, expect, it } from "vitest";
import { buildControlsHtml, type ControlsHtmlOptions } from "../ui/controlsHtml";

const ALL: ControlsHtmlOptions = {
    audioMenu: true,
    subtitlesMenu: true,
    skipBackSeconds: 10,
    skipForwardSeconds: 10,
};

function render(options: Partial<ControlsHtmlOptions> = {}, id = "p1"): Document {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = buildControlsHtml({ ...ALL, ...options }, id);
    return doc;
}

describe("buildControlsHtml", () => {
    it("has no cogwheel: each setting is its own button", () => {
        const doc = render();
        expect(doc.querySelector(".lmpl-settings")).toBeNull();
        expect(doc.querySelector(".lmpl-cluster-top")).toBeNull();
        for (const kind of ["quality", "audio", "speed", "captions"]) {
            expect(doc.querySelectorAll(`.lmpl-opt-${kind}`), kind).toHaveLength(1);
        }
    });

    it("uses the language glyph for language, and names every setting and volume step from the labels it is given", () => {
        const doc = document.implementation.createHTMLDocument("");
        doc.body.innerHTML = buildControlsHtml(ALL, "p1", {
            browse: "B",
            quality: "Qualité",
            audio: "Langue",
            speed: "Vitesse",
            captions: "Sous-titres",
            volumeUp: "Plus fort",
            volumeDown: "Moins fort",
        });
        expect(doc.querySelector(".lmpl-opt-audio media-icon")!.getAttribute("name")).toBe(
            "language",
        );
        expect(
            doc.querySelector(".lmpl-opt-audio .media-settings-menu-trigger-label")!.textContent,
        ).toBe("Langue");
        expect(doc.querySelector(".lmpl-card-captions .lmpl-card-title")!.textContent).toBe(
            "Sous-titres",
        );
        expect(
            [...doc.querySelectorAll(".lmpl-vstep")].map((b) => b.getAttribute("aria-label")),
        ).toEqual(["Plus fort", "Moins fort"]);
    });

    it("opens each setting as its own card, a menu holding its radio group directly under a title", () => {
        const doc = render();
        const expected: Record<string, [string, string]> = {
            quality: ["media-quality-radio-group", "Quality"],
            audio: ["media-audio-track-radio-group", "Language"],
            speed: ["media-playback-rate-radio-group", "Speed"],
            captions: ["media-captions-radio-group", "Captions"],
        };
        for (const [kind, [group, title]] of Object.entries(expected)) {
            const card = doc.querySelector(`.lmpl-card-${kind}`)!;
            expect(card.localName).toBe("media-menu");
            expect(card.getAttribute("side")).toBe("top");
            expect(card.querySelector(group), kind).not.toBeNull();
            expect(card.querySelector(".lmpl-card-title")!.textContent).toBe(title);
            // Nothing is nested a level deep behind a back arrow.
            expect(card.querySelector(".media-menu-back-item")).toBeNull();
            expect(doc.querySelector(`.lmpl-opt-${kind}`)!.getAttribute("commandfor")).toBe(
                card.id,
            );
        }
    });

    it("puts the settings under the timeline, after the volume", () => {
        const row = render().querySelector(".lmpl-actions-row")!;
        expect(
            [...row.children].map((e) =>
                e.className.split(" ").find((c) => c.startsWith("lmpl-") && c !== "lmpl-group"),
            ),
        ).toEqual(["lmpl-volume", "lmpl-options", "lmpl-spacer", "lmpl-remote"]);
        expect(row.querySelector(".lmpl-options .lmpl-opt")).not.toBeNull();
    });

    it("opens the volume as a card over the mute button: plus above a vertical slider above minus", () => {
        const doc = render();
        const volume = doc.querySelector(".lmpl-volume")!;
        const mute = volume.querySelector("media-mute-button")!;
        const card = volume.querySelector("media-volume-popover")!;
        expect(mute.getAttribute("commandfor")).toBe(card.id);
        const inner = card.querySelector(".lmpl-volume-card-inner")!;
        expect([...inner.children].map((e) => e.localName)).toEqual([
            "button",
            "media-volume-slider",
            "button",
        ]);
        expect((inner.children[0] as HTMLElement).dataset.volumeStep).toBe("1");
        expect((inner.children[2] as HTMLElement).dataset.volumeStep).toBe("-1");
        expect(inner.querySelector("media-volume-slider")!.getAttribute("orientation")).toBe(
            "vertical",
        );
    });

    it("labels the plus and minus buttons for a screen reader", () => {
        const labels = [...render().querySelectorAll("[data-volume-step]")].map((e) =>
            e.getAttribute("aria-label"),
        );
        expect(labels).toEqual(["Volume up", "Volume down"]);
    });

    it("has no thumb on the volume slider, like the timeline", () => {
        expect(render().querySelector("media-volume-slider media-slider-thumb")).toBeNull();
    });

    it("wraps the card's contents, because a popover's own display is what closes it", () => {
        const card = render().querySelector("media-volume-popover")!;
        expect([...card.children].map((e) => e.className)).toEqual(["lmpl-volume-card-inner"]);
    });

    it("groups casting, AirPlay and picture-in-picture with fullscreen, on the right", () => {
        const remote = render().querySelector(".lmpl-remote")!;
        expect([...remote.children].map((e) => e.localName)).toEqual([
            "media-cast-button",
            "media-airplay-button",
            "media-pip-button",
            "media-fullscreen-button",
        ]);
    });

    it("centres play between the skip buttons, back first", () => {
        const kids = [...render().querySelector(".lmpl-cluster-centre")!.children].map(
            (e) => e.localName,
        );
        expect(kids).toEqual(["media-seek-button", "media-play-button", "media-seek-button"]);
    });

    it("seeks backwards and forwards by the configured interval, and writes it in the icon", () => {
        const doc = render({ skipBackSeconds: 5, skipForwardSeconds: 30 });
        const back = doc.querySelector(".lmpl-seek-back")!;
        const forward = doc.querySelector(".lmpl-seek-forward")!;
        expect(back.getAttribute("seconds")).toBe("-5");
        expect(forward.getAttribute("seconds")).toBe("30");
        expect(back.querySelector("text")!.textContent).toBe("5");
        expect(forward.querySelector("text")!.textContent).toBe("30");
    });

    it("draws any interval, not only the three Video.js 8 had icons for", () => {
        expect(
            render({ skipForwardSeconds: 15 }).querySelector(".lmpl-seek-forward text")!
                .textContent,
        ).toBe("15");
    });

    it.each([
        ["back", { skipBackSeconds: 0 }],
        ["forward", { skipForwardSeconds: 0 }],
    ] as const)("removes the %s button when its interval is 0", (direction, options) => {
        const doc = render(options);
        expect(doc.querySelector(`.lmpl-seek-${direction}`)).toBeNull();
        expect(doc.querySelector("media-play-button")).not.toBeNull();
    });

    it.each([[-5], [NaN]])(
        "treats %s as no button rather than a button that seeks nowhere",
        (seconds) => {
            expect(
                render({ skipBackSeconds: seconds }).querySelector(".lmpl-seek-back"),
            ).toBeNull();
        },
    );

    it("leaves the language selector out when asked", () => {
        expect(render().querySelector(".lmpl-opt-audio")).not.toBeNull();
        const doc = render({ audioMenu: false });
        expect(doc.querySelector("media-audio-track-radio-group")).toBeNull();
        expect(doc.querySelector(".lmpl-opt-audio")).toBeNull();
    });

    it("leaves out every trace of subtitles when asked: the button and its card", () => {
        const doc = render({ subtitlesMenu: false });
        expect(doc.querySelector("media-captions-radio-group")).toBeNull();
        expect(doc.querySelector(".lmpl-opt-captions")).toBeNull();
        expect(doc.querySelector(".lmpl-card-captions")).toBeNull();
        expect(render().querySelector(".lmpl-opt-captions")).not.toBeNull();
    });

    it("keeps quality and speed whatever else is left out", () => {
        const doc = render({ audioMenu: false, subtitlesMenu: false });
        expect(doc.querySelector(".lmpl-opt-quality")).not.toBeNull();
        expect(doc.querySelector(".lmpl-opt-speed")).not.toBeNull();
    });

    it("keeps the radio items inside <template> children, which is where v10 clones them from", () => {
        const group = render().querySelector("media-quality-radio-group")!;
        expect(
            group.querySelector("template")!.content.querySelector("media-menu-radio-item"),
        ).not.toBeNull();
    });

    it("has a timeline with no thumb: the fill is the playhead", () => {
        const slider = render().querySelector("media-time-slider")!;
        expect(slider.querySelector("media-slider-thumb")).toBeNull();
        expect(slider.querySelector("media-slider-fill")).not.toBeNull();
        expect(slider.querySelector("media-slider-buffer")).not.toBeNull();
        expect(slider.querySelector("media-slider-value")).not.toBeNull();
    });

    it("puts the timeline on its own row above the buttons, with the times at its ends", () => {
        const bottom = render().querySelector(".lmpl-bottom")!;
        expect([...bottom.children].map((e) => e.className)).toEqual([
            "lmpl-chapter-now",
            "lmpl-timeline-row",
            "lmpl-actions-row",
        ]);
        const row = bottom.querySelector(".lmpl-timeline-row")!;
        expect([...row.children].map((e) => e.localName)).toEqual([
            "media-time",
            "media-time-slider",
            "media-time",
        ]);
        expect(
            bottom.querySelector(".lmpl-actions-row .lmpl-remote media-fullscreen-button"),
        ).not.toBeNull();
    });

    it("has a place for the chapter label above the timeline, hidden until the player has something to say", () => {
        const label = render().querySelector<HTMLElement>(".lmpl-bottom > .lmpl-chapter-now")!;
        expect(label.hidden).toBe(true);
        expect(label.textContent).toBe("");
        expect(label.nextElementSibling?.className).toBe("lmpl-timeline-row");
    });

    it("does not put an audio/video toggle in the player", () => {
        expect(buildControlsHtml(ALL, "p1")).not.toMatch(/av-toggle|audio.?video/i);
    });

    it("points every menu trigger at a menu that exists, and no two players share an id", () => {
        const ids = (id: string) => {
            const doc = render({}, id);
            const targets = [...doc.querySelectorAll("[commandfor]")].map(
                (e) => e.getAttribute("commandfor")!,
            );
            for (const target of targets) expect(doc.getElementById(target), target).not.toBeNull();
            return [...doc.querySelectorAll("[id]")].map((e) => e.id);
        };
        const a = ids("one");
        const b = ids("two");
        // One card per setting, and the volume's; nothing else carries an id.
        expect(a).toHaveLength(5);
        expect(a.filter((id) => b.includes(id))).toEqual([]);
        expect(new Set(a).size).toBe(a.length);
    });
});

describe("browse button", () => {
    it("sits with the settings, named for a screen reader, and starts collapsed", () => {
        const button = render().querySelector(".lmpl-options [data-browse-toggle]")!;
        expect(button.localName).toBe("button");
        expect(button.getAttribute("aria-expanded")).toBe("false");
        expect(button.getAttribute("aria-haspopup")).toBe("dialog");
        expect(button.getAttribute("aria-controls")).toBe("p1-browse");
        expect(button.textContent).toBe("Chapters and up next");
    });

    it("takes its name from the labels given, escaped", () => {
        const doc = document.implementation.createHTMLDocument("");
        doc.body.innerHTML = buildControlsHtml(ALL, "p1", { browse: "Kapittels <&> volgende" });
        expect(doc.querySelector("[data-browse-toggle]")!.textContent).toBe(
            "Kapittels <&> volgende",
        );
    });
});
