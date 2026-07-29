import { describe, expect, it } from "vitest";
import { localizedStaticRoutes } from "./localizedRoutes";

describe("localizedStaticRoutes", () => {
    it("creates non-default localized public static routes", () => {
        const routes = localizedStaticRoutes(["en", "es", "fr", "es"], "en");

        expect(routes.map((r) => r.path)).toEqual([
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
