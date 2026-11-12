import { describe, expect, it } from "vitest";
import { capQualityCard } from "../ui/qualityCap";

function card(labels: string[]): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML =
        "<media-quality-radio-group>" +
        labels
            .map(
                (label) =>
                    `<media-menu-radio-item><span data-part="label">${label}</span></media-menu-radio-item>`,
            )
            .join("") +
        "</media-quality-radio-group>";
    return root;
}
const capped = (root: HTMLElement) =>
    [...root.querySelectorAll("media-menu-radio-item")].map((item) =>
        item.hasAttribute("data-lmpl-capped"),
    );

describe("the control bar's quality card under a cap", () => {
    it("hides the levels the player's list leaves out, never Auto", () => {
        const root = card(["Auto (720p)", "720p", "360p", "144p"]);
        capQualityCard(root, new Set([360, 144]));
        expect(capped(root)).toEqual([false, true, false, false]);
    });

    it("shows every level again at once when the cap goes", () => {
        const root = card(["Auto", "720p", "360p"]);
        capQualityCard(root, new Set([360]));
        capQualityCard(root, new Set([720, 360]));
        expect(capped(root)).toEqual([false, false, false]);
    });

    it("hides nothing while the list is not known", () => {
        const root = card(["Auto", "720p"]);
        capQualityCard(root, new Set());
        expect(capped(root)).toEqual([false, false]);
    });
});
