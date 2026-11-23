import type { Component } from "vue";

/**
 * The named spots where the page may show a promotion.
 *
 * - `player-download`: the page's own now-playing screen, in its tools, where the platform's screen has its download
 *   tool.
 */
export type AppPromoPlacement = "player-download";

/** Promotional content a build target places on the page; without one, every placement renders nothing. */
export type AppPromoService = {
    /**
     * The component to render at `placement`, or undefined for none. Read reactively, so a placement follows a
     * change in the answer.
     */
    component(placement: AppPromoPlacement): Component | undefined;
};
