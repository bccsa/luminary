import { describe, expect, it } from "vitest";
import { localizedStaticRoutes } from "./localizedRoutes";

describe("localizedStaticRoutes", () => {
    it("creates non-default localized public static routes", () => {
        const routes = localizedStaticRoutes(["en", "es", "fr", "es"], "en");

        expect(routes.map((r) => r.path)).toEqual([
            "/es",
            "/es/explore",
            "/es/watch",
            "/fr",
            "/fr/explore",
            "/fr/watch",
        ]);
        expect(routes.map((r) => r.name)).toEqual([
            "home-es",
            "explore-es",
            "watch-es",
            "home-fr",
            "explore-fr",
            "watch-fr",
        ]);
        expect(routes.every((r) => r.meta?.prerender)).toBe(true);
    });
});
