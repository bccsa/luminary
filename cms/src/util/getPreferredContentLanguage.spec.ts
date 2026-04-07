import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

vi.mock("@/globalConfig", () => ({
    cmsLanguageIdAsRef: ref("lang-en"),
    cmsDefaultLanguage: ref({ _id: "lang-default" }),
}));

import { getPreferredContentLanguage } from "./getPreferredContentLanguage";

describe("getPreferredContentLanguage", () => {
    it("returns undefined for empty languages array", () => {
        expect(getPreferredContentLanguage([])).toBeUndefined();
    });

    it("returns preferredLanguage when it exists in the list", () => {
        expect(getPreferredContentLanguage(["lang-en", "lang-fr"], "lang-fr")).toBe("lang-fr");
    });

    it("returns cmsLanguageIdAsRef when preferred is not in list but CMS language is", () => {
        expect(getPreferredContentLanguage(["lang-en", "lang-fr"])).toBe("lang-en");
    });

    it("returns cmsDefaultLanguage when neither preferred nor CMS language match", () => {
        expect(getPreferredContentLanguage(["lang-default", "lang-other"], "lang-missing")).toBe(
            "lang-default",
        );
    });

    it("returns first language as final fallback", () => {
        expect(getPreferredContentLanguage(["lang-xyz", "lang-abc"], "lang-missing")).toBe(
            "lang-xyz",
        );
    });
});
