import { describe, it, expect, vi } from "vitest";
import type { RouteRecordRaw } from "vue-router";
import {
    enumerateSite,
    eligibleSlugRoutes,
    localizedStaticPaths,
    siteRoutes,
    staticPrerenderRoutes,
    type EnumeratedContent,
    type EnumeratedLanguage,
} from "./routeEnumeration";
import type { KeysetQuery } from "./queryDrain";

const routeRecords = [
    { path: "/", meta: { prerender: true } },
    { path: "/explore", meta: { prerender: true } },
    { path: "/404", meta: { prerender: true } },
    { path: "/open" },
    { path: "/settings", meta: { prerender: true } },
    { path: "/:slug", meta: { prerender: true } },
] as unknown as RouteRecordRaw[];

const languages: EnumeratedLanguage[] = [
    { _id: "lang-eng", updatedTimeUtc: 1, languageCode: "eng", default: 1 },
    { _id: "lang-fra", updatedTimeUtc: 2, languageCode: "fra" },
];

const now = 1_000;
const docs: EnumeratedContent[] = [
    { _id: "c1", updatedTimeUtc: 1, slug: "one", publishDate: 500 },
    { _id: "c2", updatedTimeUtc: 2, slug: "later", publishDate: now + 1 },
    { _id: "c3", updatedTimeUtc: 3, slug: "no-publish-date" },
    { _id: "c4", updatedTimeUtc: 4 },
    { _id: "c5", updatedTimeUtc: 5, slug: "one", publishDate: 600 },
];

describe("staticPrerenderRoutes", () => {
    it("takes only prerender-flagged, non-dynamic routes", () => {
        expect(staticPrerenderRoutes(routeRecords)).toEqual(["/", "/explore", "/404", "/settings"]);
    });
});

describe("localizedStaticPaths", () => {
    it("prefixes every non-default language and maps / to the bare prefix", () => {
        expect(localizedStaticPaths(["/", "/explore"], ["eng", "fra", "fra"], "eng")).toEqual([
            "/fra",
            "/fra/explore",
        ]);
    });
});

describe("eligibleSlugRoutes", () => {
    it("skips coming-soon and slug-less docs, and deduplicates", () => {
        expect(eligibleSlugRoutes(docs, now)).toEqual(["/one", "/no-publish-date"]);
    });
});

describe("siteRoutes", () => {
    it("composes the public set, excluding private routes and leaving /404 unlocalized", () => {
        const result = siteRoutes({ routeRecords, docs, languages, now });

        expect(result.all).toEqual([
            "/",
            "/explore",
            "/404",
            "/fra",
            "/fra/explore",
            "/one",
            "/no-publish-date",
        ]);
        expect(result.all).not.toContain("/settings");
        expect(result.all).not.toContain("/fra/settings");
        expect(result.all).not.toContain("/fra/404");
        expect(result.slugRoutes).toEqual(["/one", "/no-publish-date"]);
    });
});

describe("enumerateSite", () => {
    it("drains content and languages once each and returns the docs with the route set", async () => {
        const transport = vi.fn(async (query: KeysetQuery) => {
            const type = (query.selector.$and as Array<{ type?: string }>)[0].type;
            const isFirstPage = !(query.selector.$and as Array<{ $or?: unknown }>).some(
                (c) => c.$or,
            );
            if (!isFirstPage) return [];
            return type === "content" ? docs : type === "language" ? languages : [];
        });
        const operations: string[] = [];
        const transportFor = (operation: string) => {
            operations.push(operation);
            return transport as never;
        };

        const site = await enumerateSite({ transportFor, routeRecords, now });

        expect(operations).toEqual(["route enumeration", "language enumeration"]);
        expect(site.docs).toEqual(docs);
        expect(site.defaultLanguage?._id).toBe("lang-eng");
        expect(site.langCodes).toEqual(["eng", "fra"]);
        expect(site.routes.all).toContain("/one");
        expect(site.routes.all).toContain("/fra/explore");
    });
});
