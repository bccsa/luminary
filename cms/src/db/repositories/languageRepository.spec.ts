import "fake-indexeddb/auto";
import { describe, it, afterEach, expect, beforeEach } from "vitest";
import { db } from "../baseDatabase";
import { mockLanguageDtoEng, mockLanguageDtoFra } from "@/tests/mockData";
import { LanguageRepository } from "./languageRepository";

describe("languageRepository", () => {
    beforeEach(() => {
        db.docs.bulkPut([mockLanguageDtoEng, mockLanguageDtoFra]);
    });

    afterEach(() => {
        db.docs.clear();
    });

    it("can find a single language", async () => {
        const repository = new LanguageRepository();

        const result = await repository.find("lang-eng");

        expect(result._id).toBe("lang-eng");
    });

    it("can find all languages", async () => {
        const repository = new LanguageRepository();

        const result = await repository.findAll();

        expect(result.length).toBe(2);
        expect(result[0]._id).toBe(mockLanguageDtoEng._id);
        expect(result[0].updatedTimeUtc).toEqual(new Date(mockLanguageDtoEng.updatedTimeUtc!));
    });
});
