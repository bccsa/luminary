import { describe, it, expect } from "vitest";
import { contentLanguageKeepSelector } from "./keepSelector";

describe("contentLanguageKeepSelector", () => {
    it("returns match-all {} for an empty language set", () => {
        expect(contentLanguageKeepSelector([])).toEqual({});
    });

    it("builds the set-based keep for a single language", () => {
        const sel: any = contentLanguageKeepSelector(["en"]);
        // Branch 1: synced-language membership.
        expect(sel.$or[0]).toEqual({ language: { $in: ["en"] } });
        // Branch 2: fallback — none of the synced languages is an availableTranslation.
        expect(sel.$or[1]).toEqual({
            $and: [{ $not: { availableTranslations: { $elemMatch: { $eq: "en" } } } }],
        });
    });

    it("builds one fallback negation per language, preserving membership", () => {
        const langs = ["en", "fr", "sw"];
        const sel: any = contentLanguageKeepSelector(langs);
        expect(sel.$or[0].language.$in).toEqual(langs);
        expect(
            sel.$or[1].$and.map((c: any) => c.$not.availableTranslations.$elemMatch.$eq),
        ).toEqual(langs);
    });

    it("does not alias the input array (spreads into $in)", () => {
        const langs = ["en", "fr"];
        const sel: any = contentLanguageKeepSelector(langs);
        expect(sel.$or[0].language.$in).not.toBe(langs);
        expect(sel.$or[0].language.$in).toEqual(langs);
    });

    it("keeps the clause count well under the API's MAX_SELECTOR_CLAUSES (256) at the cap", () => {
        // At the product cap (3 preferred + 1 auto-appended default = 4), the keep is ~O(L): one
        // $in branch + L negated availableTranslations clauses. Count object keys as the validator does.
        const sel = contentLanguageKeepSelector(["a", "b", "c", "d"]);
        const countKeys = (node: unknown): number => {
            if (node === null || typeof node !== "object") return 0;
            if (Array.isArray(node)) return node.reduce((n, item) => n + countKeys(item), 0);
            return Object.keys(node as object).reduce(
                (n, k) => n + 1 + countKeys((node as any)[k]),
                0,
            );
        };
        expect(countKeys(sel)).toBeLessThan(256);
    });
});
