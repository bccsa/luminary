import type {
    AnalyticsEventName,
    AnalyticsParams,
    AnalyticsService,
} from "@/build-time/contracts/analytics/contract";

declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: (...args: unknown[]) => void;
    }
}

type PageView = { path: string; title: string };

/**
 * Browser {@link AnalyticsService} on gtag.js. The script is fetched only once the reader has
 * consented, so nothing reaches Google before that.
 */
export class WebAnalyticsService implements AnalyticsService {
    private enabled = false;
    private loaded = false;
    private lastPageView: PageView | undefined;
    private platform: string | undefined;

    constructor(private readonly measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID) {}

    setEnabled(enabled: boolean): void {
        if (!this.measurementId || enabled === this.enabled) return;
        this.enabled = enabled;
        (window as unknown as Record<string, boolean>)[`ga-disable-${this.measurementId}`] =
            !enabled;

        if (!enabled) {
            clearGaCookies();
            return;
        }

        if (!this.loaded) this.load();
        // The page the reader is on when they accept would otherwise go uncounted.
        if (this.lastPageView) this.sendPageView(this.lastPageView);
    }

    pageView(view: PageView): void {
        this.lastPageView = view;
        if (this.enabled) this.sendPageView(view);
    }

    event(name: AnalyticsEventName, params?: AnalyticsParams): void {
        if (this.enabled) window.gtag?.("event", name, params);
    }

    setUserProperty(name: "platform", value: string): void {
        this.platform = value;
        if (this.enabled) window.gtag?.("set", "user_properties", { [name]: value });
    }

    private load(): void {
        this.loaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag() {
            // gtag.js reads the `arguments` object itself, not an array copy.
            // eslint-disable-next-line prefer-rest-params
            window.dataLayer!.push(arguments);
        };
        window.gtag("js", new Date());
        // Page views are sent from the router, so the SPA's navigations are counted.
        window.gtag("config", this.measurementId, {
            send_page_view: false,
            page_location: pageLocation(window.location.pathname),
        });
        if (this.platform) window.gtag("set", "user_properties", { platform: this.platform });

        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.measurementId!)}`;
        document.head.appendChild(script);
    }

    private sendPageView({ path, title }: PageView): void {
        const page = { page_location: pageLocation(path), page_title: title };
        // Every later event reports this page too: gtag would otherwise read the browser's URL,
        // query string (search terms, sign-in codes) included.
        window.gtag?.("set", page);
        window.gtag?.("event", "page_view", { ...page, page_path: path });
    }
}

const pageLocation = (path: string) => window.location.origin + path;

/** Drops the GA client-id cookies, so a reader who withdraws consent is no longer identifiable. */
function clearGaCookies(): void {
    const names = document.cookie
        .split(";")
        .map((c) => c.split("=")[0].trim())
        .filter((name) => name === "_ga" || name.startsWith("_ga_"));
    // gtag sets them on the top-level domain it can reach, so clear every parent domain.
    const parts = window.location.hostname.split(".");
    const domains = parts.map((_, i) => parts.slice(i).join("."));
    for (const name of names) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
        for (const domain of domains) {
            document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
        }
    }
}
