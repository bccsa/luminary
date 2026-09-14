/**
 * Public-route enumeration for the web build: which routes exist, in which languages, under
 * which slugs. Shared by the prerender (`vite.config.web.ts`) and the enumerate-only entry
 * point (`scripts/enumerate-routes.mjs`) so a driver batching the site into several scoped
 * passes gets the route list from the same code the build renders from.
 */

import type { RouteRecordRaw } from "vue-router";
import {
    drainQuery,
    enumeratePublicContent,
    isRouteEligible,
    type KeysetDocument,
    type KeysetQuery,
    type QueryTransport,
} from "./queryDrain";

export type EnumeratedLanguage = KeysetDocument & { languageCode?: string; default?: number };
export type EnumeratedContent = KeysetDocument & { slug?: string; publishDate?: number };

/** Named per drain so a failure says which enumeration hit the API problem. */
export type TransportFactory = (operation: string) => QueryTransport;

export type SiteRoutes = {
    staticRoutes: string[];
    localizedRoutes: string[];
    slugRoutes: string[];
    /** Every public route, deduplicated — what a full build prerenders. */
    all: string[];
};

export type EnumeratedSite<TContent extends EnumeratedContent = EnumeratedContent> = {
    docs: TContent[];
    languages: EnumeratedLanguage[];
    defaultLanguage?: EnumeratedLanguage;
    langCodes: string[];
    routes: SiteRoutes;
};

/** Private / per-user routes — never prerendered. */
export const EXCLUDED_ROUTES: ReadonlySet<string> = new Set(["/open", "/settings", "/bookmarks"]);

/**
 * The 404 error page is prerendered only in the default language — a worker-served custom error
 * page has no per-request locale — so it is kept out of the locale-prefixed variants while still
 * being prerendered itself.
 */
const UNLOCALIZED_STATIC_ROUTES: ReadonlySet<string> = new Set(["/404"]);

/** A thin `fetch` wrapper around `/query` for the build's own Node-side drains. */
export function queryTransport(apiUrl: string, operation: string): QueryTransport {
    return async <T extends KeysetDocument>(query: KeysetQuery): Promise<T[]> => {
        const res = await fetch(`${apiUrl}/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query),
        });
        if (!res.ok) {
            throw new Error(`[ssg] ${operation} failed: ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as { docs?: T[] };
        return data.docs ?? [];
    };
}

/**
 * Static public routes flagged for prerender. The public "main" routes (`/`, `/explore`,
 * `/watch`) are included via `meta.prerender` — they render their tile collections through the
 * SSG-aware useContentQuery seam.
 */
export function staticPrerenderRoutes(routeRecords: readonly RouteRecordRaw[]): string[] {
    return routeRecords
        .filter((r) => r.meta?.prerender && typeof r.path === "string" && !r.path.includes(":"))
        .map((r) => r.path as string);
}

export function localizedStaticPaths(
    staticRoutes: string[],
    langCodes: string[],
    defaultCode: string,
): string[] {
    return [...new Set(langCodes)]
        .filter((code) => code && code !== defaultCode)
        .flatMap((code) =>
            staticRoutes.map((route) => (route === "/" ? `/${code}` : `/${code}${route}`)),
        );
}

/**
 * Slug routes for the docs that are readable now. The corpus carries coming-soon docs too, so
 * `isRouteEligible` is what keeps one to a feed tile without a page.
 */
export function eligibleSlugRoutes(docs: readonly EnumeratedContent[], now: number): string[] {
    const routes = new Set<string>();
    for (const doc of docs) {
        if (!doc.slug || !isRouteEligible(doc, now)) continue;
        routes.add(`/${doc.slug}`);
    }
    return [...routes];
}

export function defaultLanguageOf(
    languages: readonly EnumeratedLanguage[],
): EnumeratedLanguage | undefined {
    return languages.find((l) => l.default === 1) ?? languages[0];
}

export function languageCodesOf(languages: readonly EnumeratedLanguage[]): string[] {
    return languages.map((l) => l.languageCode).filter((code): code is string => !!code);
}

/** Composes the full public route set from drained docs/languages and the app's route table. */
export function siteRoutes(options: {
    routeRecords: readonly RouteRecordRaw[];
    docs: readonly EnumeratedContent[];
    languages: readonly EnumeratedLanguage[];
    now: number;
}): SiteRoutes {
    const { routeRecords, docs, languages, now } = options;
    // Excluded up front, not just out of `all`, so an excluded route that also carries
    // `meta.prerender` can't reach the set through a locale-prefixed variant.
    const staticRoutes = staticPrerenderRoutes(routeRecords).filter((r) => !EXCLUDED_ROUTES.has(r));
    const localizedRoutes = localizedStaticPaths(
        staticRoutes.filter((r) => !UNLOCALIZED_STATIC_ROUTES.has(r)),
        languageCodesOf(languages),
        defaultLanguageOf(languages)?.languageCode ?? "",
    );
    const slugRoutes = eligibleSlugRoutes(docs, now);
    // Filtered again for the slug routes: a doc whose slug collides with an excluded path.
    const all = [...new Set([...staticRoutes, ...localizedRoutes, ...slugRoutes])].filter(
        (p) => !EXCLUDED_ROUTES.has(p),
    );
    return { staticRoutes, localizedRoutes, slugRoutes, all };
}

/**
 * Drains the content corpus and languages, then composes the route set. Returns the drained docs
 * so the prerender can build its sidecars from them instead of draining a second time.
 */
export async function enumerateSite<
    TContent extends EnumeratedContent = EnumeratedContent,
>(options: {
    transportFor: TransportFactory;
    routeRecords: readonly RouteRecordRaw[];
    now: number;
}): Promise<EnumeratedSite<TContent>> {
    const { transportFor, routeRecords, now } = options;
    const docs = await enumeratePublicContent<TContent>(transportFor("route enumeration"));
    const languages = await drainQuery<EnumeratedLanguage>(transportFor("language enumeration"), {
        type: "language",
    });
    return {
        docs,
        languages,
        defaultLanguage: defaultLanguageOf(languages),
        langCodes: languageCodesOf(languages),
        routes: siteRoutes({ routeRecords, docs, languages, now }),
    };
}
