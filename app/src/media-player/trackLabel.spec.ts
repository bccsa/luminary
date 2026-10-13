import { describe, expect, it } from "vitest";
import { trackLabel } from "./trackLabel";

describe("trackLabel", () => {
    it("names a track the packager numbered by its language, in the viewer's language", () => {
        expect(trackLabel({ label: "stream_0", lang: "en" }, "en")).toBe("English");
        expect(trackLabel({ label: "stream_2", lang: "fr" }, "en")).toBe("French");
        expect(trackLabel({ label: "stream_2", lang: "fr" }, "fr")).toBe("Français");
        expect(trackLabel({ label: "Track 3", lang: "el" }, "en")).toBe("Greek");
    });

    it("keeps a name the track has of its own", () => {
        expect(trackLabel({ label: "English SDH", lang: "en" }, "en")).toBe("English SDH");
        expect(trackLabel({ label: "Commentary", lang: "en" }, "fr")).toBe("Commentary");
    });

    it("keeps the label when there is no language, or the language is not one", () => {
        expect(trackLabel({ label: "stream_1" }, "en")).toBe("stream_1");
        expect(trackLabel({ label: "stream_1", lang: "not a code!" }, "en")).toBe("stream_1");
    });
});
