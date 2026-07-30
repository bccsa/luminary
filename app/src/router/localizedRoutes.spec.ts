import { describe, expect, it } from "vitest";
import { localizedStaticRoutes } from "./localizedRoutes";

describe("localizedStaticRoutes", () => {
    it("creates localized public static routes, including a prefixed route for the default language", () => {
        const routes = localizedStaticRoutes(["en", "es", "fr", "es"]);

        expect(routes.map((r) => r.path)).toEqual([
            "/en",
            "/en/explore",
            "/en/search",
            "/en/watch",
            "/es",
            "/es/explore",
            "/es/search",
            "/es/watch",
            "/fr",
            "/fr/explore",
            "/fr/search",
            "/fr/watch",
        ]);
        expect(routes.map((r) => r.name)).toEqual([
            "home-en",
            "explore-en",
            "search-en",
            "watch-en",
            "home-es",
            "explore-es",
            "search-es",
            "watch-es",
            "home-fr",
            "explore-fr",
            "search-fr",
            "watch-fr",
        ]);
        expect(routes.every((r) => r.meta?.prerender)).toBe(true);
    });
});
