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
};
