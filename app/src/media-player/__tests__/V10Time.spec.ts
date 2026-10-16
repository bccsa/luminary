import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import V10Button from "../V10Button.vue";
import { timeEnds } from "../v10Time";

describe("timeEnds", () => {
    it("reads what has played and what is left, adding up to the length", () => {
        expect(timeEnds(7.4, 120)).toEqual({ elapsed: "0:07", remaining: "-1:53" });
    });

    it("pads minutes when the length has ten or more, and shows hours past an hour", () => {
        expect(timeEnds(65, 1200)).toEqual({ elapsed: "01:05", remaining: "-18:55" });
        expect(timeEnds(65, 3700)).toEqual({ elapsed: "0:01:05", remaining: "-1:00:35" });
    });

    it("says LIVE, with nothing left, for a live stream", () => {
        expect(timeEnds(5, 0, true)).toEqual({ elapsed: "LIVE", remaining: "" });
    });

    it("never goes below zero past the end", () => {
        expect(timeEnds(130, 120).remaining).toBe("-0:00");
    });
});

describe("V10Button", () => {
    it("is labelled, and round when asked", async () => {
        const plain = mount(V10Button, { props: { label: "Mute" }, slots: { default: "x" } });
        expect(plain.attributes("aria-label")).toBe("Mute");
        expect(plain.classes()).not.toContain("rounded-full");

        const round = mount(V10Button, { props: { label: "Play", round: true } });
        expect(round.classes()).toContain("rounded-full");
        await round.trigger("click");
        expect(round.emitted("click")).toHaveLength(1);
    });
});
