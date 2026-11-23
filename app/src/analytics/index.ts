import { watch } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";
import type { ContentDto } from "luminary-shared";
import type {
    AnalyticsEventName,
    AnalyticsParams,
    AnalyticsService,
} from "@/build-time/contracts/analytics/contract";
import { isPrerender } from "@/ssg/isPrerender";

/** GA4 drops parameter values longer than this. */
const MAX_PARAM_LENGTH = 100;

let service: AnalyticsService | undefined;
let languageCodeOf: (languageId: string) => string | undefined = () => undefined;

export type StartAnalyticsOptions = {
    router: Router;
    /** Reported as the `platform` user property; the packaged app reports its OS instead. */
    platform: string;
    /** Whether the reader accepted the privacy policy; collection follows it live. */
    consented: () => boolean;
    languageCode?: (languageId: string) => string | undefined;
};

/**
 * Hands the build target's analytics to the module-level helpers, so plain modules
 * (the media player store, share helpers) can report without an injection context.
 */
export function startAnalytics(
    analytics: AnalyticsService | undefined,
    { router, platform, consented, languageCode }: StartAnalyticsOptions,
): void {
    if (!analytics || isPrerender()) return;
    service = analytics;
    if (languageCode) languageCodeOf = languageCode;

    analytics.setUserProperty("platform", platform);
    watch(consented, (enabled) => analytics.setEnabled(enabled), { immediate: true });

    const report = (to: RouteLocationNormalized) => {
        // A sign-in callback is a hop through the app, not a page the reader visited.
        if (to.query.code && to.query.state) return;
        const title =
            (to.meta.title as string) ||
            (to.params.slug as string) ||
            (to.name as string) ||
            to.path;
        // The path only: query strings can carry tokens and search terms.
        analytics.pageView({ path: to.path, title: truncate(title) ?? to.path });
    };
    router.afterEach((to, _from, failure) => {
        if (!failure) report(to);
    });
    // The first navigation settled before analytics started.
    if (router.currentRoute.value.matched.length) report(router.currentRoute.value);
}

/** Reports an event; does nothing before {@link startAnalytics}, or while the reader has not consented. */
export function trackEvent(name: AnalyticsEventName, params?: AnalyticsParams): void {
    service?.event(name, params);
}

/** The parameters that identify a piece of content in the usage reports. */
export function contentParams(content: Partial<ContentDto>): AnalyticsParams {
    return {
        content_id: content.parentId,
        content_title: truncate(content.title),
        content_language: content.language
            ? (languageCodeOf(content.language) ?? content.language)
            : undefined,
        content_author: truncate(content.author),
        content_copyright: truncate(content.copyright),
        content_type: content.parentPostType ?? content.parentTagType,
    };
}

/** A share of an article or a passage from it, by the channel it went out through. */
export function trackShare(method: string, draft: { title: string; copyright?: string }): void {
    trackEvent("share", {
        method,
        content_title: truncate(draft.title),
        content_copyright: truncate(draft.copyright),
    });
}

export function truncate(value: string | undefined): string | undefined {
    return value && value.length > MAX_PARAM_LENGTH ? value.slice(0, MAX_PARAM_LENGTH) : value;
}

/** Test-only: forget the service handed over by {@link startAnalytics}. */
export function resetAnalyticsForTest(): void {
    service = undefined;
    languageCodeOf = () => undefined;
}
