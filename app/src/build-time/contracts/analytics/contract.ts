/** Event parameters; GA4 drops values over 100 characters. */
export type AnalyticsParams = Record<string, string | number | undefined>;

export type AnalyticsEventName = "content_view" | "media_play" | "media_complete" | "share";

/** Usage reporting to Google Analytics, through gtag.js in a browser or Firebase in the packaged app. */
export type AnalyticsService = {
    /** Collection runs only while enabled: the reader accepted the privacy policy. */
    setEnabled(enabled: boolean): void;
    pageView(view: { path: string; title: string }): void;
    event(name: AnalyticsEventName, params?: AnalyticsParams): void;
    setUserProperty(name: "platform", value: string): void;
};
