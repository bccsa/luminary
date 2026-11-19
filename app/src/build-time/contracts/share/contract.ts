/** What a share hands to the OS share sheet. */
export type SharePayload = {
    title: string;
    /** The message, without the link: the sheet carries `url` alongside it. */
    text: string;
    url: string;
    /** Attached where the platform accepts files; dropped otherwise. */
    files?: File[];
};

/**
 * `unavailable`: the sheet could not open, so the caller shows its own share targets instead.
 */
export type ShareResult = "shared" | "dismissed" | "unavailable";

/** The device's own share sheet, where the platform has one worth preferring. */
export type ShareService = {
    /** Whether {@link share} opens the OS share sheet here. Call it in the browser, not during a prerender. */
    isAvailable(): boolean;
    /** Whether the share sheet can carry these files. */
    canShareFiles(files: File[]): boolean;
    share(payload: SharePayload): Promise<ShareResult>;
};
