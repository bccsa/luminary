import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import V10Icon from "../V10Icon.vue";
import { V10_ICONS } from "../v10Icons";

describe("V10Icon", () => {
    it("draws every layer of the icon, outlines stroked and the rest filled", () => {
        const wrapper = mount(V10Icon, { props: { name: "check" } });
        const paths = wrapper.findAll("path");
        expect(paths).toHaveLength(V10_ICONS.check.length);
        expect(paths[0]!.attributes("stroke")).toBe("currentColor");
        expect(paths[0]!.attributes("fill")).toBe("none");

        const play = mount(V10Icon, { props: { name: "speed" } });
        expect(play.findAll("path")).toHaveLength(V10_ICONS.speed.length);
        // A half-opaque layer keeps its opacity.
        expect(play.findAll("path").some((p) => p.attributes("opacity") === "0.5")).toBe(true);
    });

    it("has every icon the portrait controls need", () => {
        for (const name of [
            "play",
            "pause",
            "volumeHigh",
            "volumeOff",
            "speech",
            "speed",
            "captions",
            "pip",
            "fullscreenExit",
            "check",
        ] as const) {
            expect(V10_ICONS[name].length).toBeGreaterThan(0);
        }
    });

    it("draws the skip glyph with its seconds, mirrored for forward", () => {
        const back = mount(V10Icon, { props: { skip: { seconds: 10, direction: "back" } } });
        expect(back.get("text").text()).toBe("10");
        expect(back.findAll("path")[0]!.attributes("d")).toContain("M3.5 12");

        const forward = mount(V10Icon, { props: { skip: { seconds: 30, direction: "forward" } } });
        expect(forward.findAll("path")[0]!.attributes("d")).toContain("M20.5 12");
    });
});
