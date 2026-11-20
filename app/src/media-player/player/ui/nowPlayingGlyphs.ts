/**
 * The now-playing screen's own glyphs, as SVG path layers on a square grid. A layer with a stroke is an outline (round
 * caps and joins), the rest are filled. The native screens draw the same paths, so the two look alike.
 */
export interface GlyphLayer {
    d: string;
    stroke?: number;
    alpha?: number;
    evenOdd?: boolean;
}

export interface Glyph {
    grid: number;
    layers: readonly GlyphLayer[];
}

const AUTOPLAY_ARC = "M19 12a7 7 0 1 1-2.05-4.95";
const AUTOPLAY_HEAD = "M17 4v3.5h-3.5";
const AUTOPLAY_NEXT = "M9.5 9v6l4-3zM14.2 9h1.4v6h-1.4z";
const MOON = "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z";

/** Autoplay: a skip-to-next inside a circling arrow, "carries on to the next". */
export const autoplayOn: Glyph = {
    grid: 24,
    layers: [{ d: AUTOPLAY_ARC, stroke: 2 }, { d: AUTOPLAY_HEAD, stroke: 2 }, { d: AUTOPLAY_NEXT }],
};

/** Autoplay off: the same, dimmed and struck through. */
export const autoplayOff: Glyph = {
    grid: 24,
    layers: [
        { d: AUTOPLAY_ARC, stroke: 2, alpha: 0.55 },
        { d: AUTOPLAY_HEAD, stroke: 2, alpha: 0.55 },
        { d: AUTOPLAY_NEXT, alpha: 0.55 },
        { d: "M5 19L19 5", stroke: 2 },
    ],
};

export const moon: Glyph = { grid: 24, layers: [{ d: MOON, stroke: 1.8 }] };

/** The sleep timer set: the moon filled, its outline kept so it stays the same size. */
export const moonFilled: Glyph = { grid: 24, layers: [{ d: MOON }, { d: MOON, stroke: 1.8 }] };

export const captionsOff: Glyph = {
    grid: 18,
    layers: [
        { d: "M3 3h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", stroke: 2 },
        {
            d: "M8.663 8.052H7.31a1.3 1.3 0 0 0-.152-.467 1.2 1.2 0 0 0-.293-.352 1.3 1.3 0 0 0-.414-.223 1.6 1.6 0 0 0-.504-.077q-.49 0-.855.244a1.56 1.56 0 0 0-.566.705q-.2.46-.2 1.118 0 .677.2 1.137.204.46.569.695t.843.235q.27 0 .498-.071.231-.072.41-.207.18-.14.297-.337.12-.198.167-.451l1.353.006q-.053.435-.263.84a2.5 2.5 0 0 1-.559.72q-.349.315-.834.5a3.1 3.1 0 0 1-1.09.183 3 3 0 0 1-1.514-.383 2.7 2.7 0 0 1-1.05-1.11Q2.968 10.032 2.968 9q0-1.035.39-1.76.39-.727 1.056-1.107a2.96 2.96 0 0 1 1.502-.383q.55 0 1.019.154.473.155.837.452.365.293.593.72.232.426.297.976m6.368 0h-1.352a1.3 1.3 0 0 0-.152-.467 1.2 1.2 0 0 0-.293-.352 1.3 1.3 0 0 0-.414-.223 1.6 1.6 0 0 0-.504-.077q-.491 0-.856.244a1.56 1.56 0 0 0-.565.705q-.2.46-.2 1.118 0 .677.2 1.137.203.46.569.695.364.235.843.235.27 0 .497-.071.232-.072.411-.207.18-.14.297-.337a1.3 1.3 0 0 0 .167-.451l1.353.006q-.053.435-.263.84a2.5 2.5 0 0 1-.56.72 2.6 2.6 0 0 1-.833.5 3.1 3.1 0 0 1-1.09.183 3 3 0 0 1-1.514-.383 2.7 2.7 0 0 1-1.05-1.11Q9.336 10.032 9.336 9q0-1.035.39-1.76.389-.727 1.056-1.107a2.96 2.96 0 0 1 1.501-.383q.55 0 1.02.154.473.155.837.452.364.293.593.72.232.426.297.976",
        },
    ],
};

/** Subtitles on: the box solid, the letters cut out of it. */
export const captionsOn: Glyph = {
    grid: 18,
    layers: [
        {
            d: "M15 2a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM5.917 5.75q-.834 0-1.502.383a2.7 2.7 0 0 0-1.057 1.106Q2.97 7.965 2.97 9q0 1.032.383 1.758a2.7 2.7 0 0 0 1.05 1.11q.667.382 1.514.382.609 0 1.09-.183.485-.185.834-.5a2.53 2.53 0 0 0 .822-1.56L7.31 10q-.047.254-.167.451a1.2 1.2 0 0 1-.707.544q-.23.07-.498.07-.478 0-.843-.234a1.54 1.54 0 0 1-.569-.695q-.2-.46-.2-1.137 0-.658.2-1.118a1.56 1.56 0 0 1 .566-.704q.365-.244.855-.244.273 0 .504.077.236.077.414.221.18.146.293.353.114.204.152.467h1.353a2.7 2.7 0 0 0-.297-.977 2.3 2.3 0 0 0-.593-.72 2.6 2.6 0 0 0-.837-.45 3.3 3.3 0 0 0-1.019-.155m6.367 0q-.834 0-1.5.383a2.7 2.7 0 0 0-1.057 1.106q-.39.726-.39 1.761 0 1.032.383 1.758.386.726 1.05 1.11.668.382 1.514.382.61 0 1.091-.183.485-.185.834-.5a2.53 2.53 0 0 0 .821-1.56L13.678 10a1.3 1.3 0 0 1-.167.451 1.2 1.2 0 0 1-.707.544q-.23.07-.498.07-.48 0-.843-.234a1.54 1.54 0 0 1-.568-.695q-.202-.46-.202-1.137 0-.658.202-1.118.2-.464.564-.704.365-.244.856-.244.272 0 .503.077.236.077.414.221.18.146.294.353.115.204.152.467h1.352a2.7 2.7 0 0 0-.296-.977 2.3 2.3 0 0 0-.593-.72 2.6 2.6 0 0 0-.837-.45 3.3 3.3 0 0 0-1.02-.155",
            evenOdd: true,
        },
    ],
};

/** The lyrics' button: open them over the cover, or put them away. */
export const lyricsExpand: Glyph = {
    grid: 24,
    layers: [{ d: "M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6", stroke: 2 }],
};
export const lyricsCollapse: Glyph = {
    grid: 24,
    layers: [{ d: "M20 9h-5V4M4 15h5v5M15 9l5-5M9 15l-5 5", stroke: 2 }],
};

/** The arrow back to the lit line in the lyrics, pointing the way it lies. */
export const arrowUp: Glyph = { grid: 24, layers: [{ d: "M12 19V5M5 12l7-7 7 7", stroke: 2.4 }] };
export const arrowDown: Glyph = { grid: 24, layers: [{ d: "M12 5v14M5 12l7 7 7-7", stroke: 2.4 }] };

export const browse: Glyph = {
    grid: 24,
    layers: [{ d: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01", stroke: 1.8 }],
};
