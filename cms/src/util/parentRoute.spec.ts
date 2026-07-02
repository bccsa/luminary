import { describe, expect, it, beforeEach } from "vitest";
import { DocType, PostType, type LanguageDto } from "luminary-shared";
import { parentRoute } from "./parentRoute";
import { cmsLanguages } from "@/globalConfig";

const lang = (id: string, languageCode: string): LanguageDto =>
    ({ _id: id, languageCode }) as LanguageDto;

describe("parentRoute", () => {
    beforeEach(() => {
        cmsLanguages.value = [lang("lang-eng", "en"), lang("lang-fra", "fr")];
    });

    it("returns undefined when parentType is missing", () => {
        expect(parentRoute({ parentId: "p1", language: "lang-fra" })).toBeUndefined();
    });

    it("resolves the languageCode by matching the language doc id", () => {
        const route = parentRoute({
            parentId: "p1",
            parentType: DocType.Post,
            parentPostType: PostType.Blog,
            language: "lang-fra",
        });

        expect(route?.params.languageCode).toBe("fr");
    });

    it("falls back to the raw language value when no matching language doc is loaded", () => {
        const route = parentRoute({
            parentId: "p1",
            parentType: DocType.Post,
            parentPostType: PostType.Blog,
            language: "lang-swa",
        });

        expect(route?.params.languageCode).toBe("lang-swa");
    });
});
