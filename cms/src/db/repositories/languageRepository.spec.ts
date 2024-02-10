import "fake-indexeddb/auto";
import { describe, it, afterEach, expect, beforeEach } from "vitest";
import { db } from "../baseDatabase";
import { mockLanguageEng, mockLanguageFra } from "@/tests/mockData";
import { LanguageRepository } from "./languageRepository";

describe("languageRepository", () => {
    beforeEach(() => {
        db.docs.bulkPut([mockLanguageEng, mockLanguageFra]);
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
    });
});
