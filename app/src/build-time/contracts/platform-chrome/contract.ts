/**
 * How the app's chrome (pinned top-bar controls, reading-page pill) interacts
 * with the platform it runs on.
 */
export type PlatformChromeService = {
    /**
     * Whether the fade gradient behind pinned mobile chrome should render.
     * The packaged app draws content full-screen under a near-opaque pill,
     * where the gradient reads as a smudge rather than a chrome backing.
     */
    readonly chromeFadeEnabled: boolean;

    /** Show/hide the OS status bar. No-op where the platform has none to manage. */
    setStatusBarHidden(hidden: boolean): void;

    /**
     * Let the app's pages turn with the phone, or keep them upright. Where the pages are held upright
     * (the packaged app on a phone), a screen that has a landscape layout of its own asks for this while it
     * is open. Absent where the platform turns pages by itself.
     */
    setPagesTurn?(allowed: boolean): void;
};
