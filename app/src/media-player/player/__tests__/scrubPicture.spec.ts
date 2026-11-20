import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ScrubPicture from "../components/ScrubPicture.vue";

describe("ScrubPicture", () => {
    it("places a cropped sheet frame by its offset", () => {
        const wrapper = mount(ScrubPicture, {
            props: { cue: { spriteUrl: "sheet.jpg", x: 160, y: 0, w: 160, h: 90 } as never },
        });
        const frame = wrapper.find(".lmpl-scrub-picture-frame");
        expect(frame.attributes("style")).toContain("-160px 0px");
        expect(frame.attributes("style")).toContain("width: 160px");
    });

    it("fills the picture with a whole-image cue as contain", () => {
        const wrapper = mount(ScrubPicture, {
            props: { cue: { spriteUrl: "frame.jpg", x: 0, y: 0 } as never },
        });
        const style = wrapper.find(".lmpl-scrub-picture-frame").attributes("style") ?? "";
        expect(style).toContain("background-size: contain");
        expect(style).toContain("width: 100%");
    });

    it("renders the root the page styles", () => {
        const wrapper = mount(ScrubPicture, {
            props: { cue: { spriteUrl: "frame.jpg", x: 0, y: 0 } as never },
        });
        expect(wrapper.classes()).toContain("lmpl-scrub-picture");
    });
});
