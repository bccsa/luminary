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

    /**
     * Hold the screen in landscape, or let the device's rotation decide again. Only where the platform can
     * turn the screen itself; a screen asks for it when the viewer chooses landscape.
     */
    lockLandscape?(locked: boolean): void;

    /**
     * Tells when the phone is turned on its side (`true`) or back upright (`false`) while the pages are held upright,
     * so a screen can go to its own full screen as a video does. Returns the way to stop listening. Only where the
     * platform holds the pages upright and can read how the phone is held.
     */
    onPhoneTurned?(listener: (sideways: boolean) => void): () => void;
};
