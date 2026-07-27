import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { DocType } from "../enums";
import {
    readSeedLanguageTranslations,
    reconcileLanguageTranslationSeeds,
} from "./languageSeedReconciliation";

describe("reconcileLanguageTranslationSeeds", () => {
    function mockDb(languages: any[]) {
        const inserted: any[] = [];
        const db = {
            processAllDocs: jest.fn(async (_types: DocType[], cb: (doc: any) => Promise<void>) => {
                for (const language of languages) await cb(language);
            }),
            insertDoc: jest.fn(async (doc: any) => {
                inserted.push({ ...doc, translations: { ...doc.translations } });
            }),
        } as any;
        return { db, inserted };
    }

    beforeEach(() => {
        jest.spyOn(Date, "now").mockReturnValue(123456789);
        jest.spyOn(Logger.prototype, "log").mockImplementation();
        jest.spyOn(Logger.prototype, "warn").mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("dynamically discovers lang-*.json seed files and ignores other files", () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-"));
        try {
            fs.writeFileSync(
                path.join(dir, "lang-eng.json"),
                JSON.stringify({ translations: { "k.eng": "en" } }),
            );
            fs.writeFileSync(
                path.join(dir, "lang-fra.json"),
                JSON.stringify({ translations: { "k.fra": "fr" } }),
            );
            // A newly-added language seed file is picked up with no code change required.
            fs.writeFileSync(
                path.join(dir, "lang-spa.json"),
                JSON.stringify({ translations: { "k.spa": "es" } }),
            );
            // Non-language seed files must be ignored.
            fs.writeFileSync(path.join(dir, "group-languages.json"), JSON.stringify({ type: "group" }));
            fs.writeFileSync(path.join(dir, "content-page1-eng.json"), JSON.stringify({ type: "content" }));

            const result = readSeedLanguageTranslations(dir);

            expect(Object.keys(result).sort()).toEqual(["lang-eng", "lang-fra", "lang-spa"]);
            expect(result["lang-eng"]).toEqual({ "k.eng": "en" });
            expect(result["lang-spa"]).toEqual({ "k.spa": "es" });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it("prunes retired keys, preserves existing values, and backfills every missing key on every language", async () => {
        const seedTranslations = {
            "lang-eng": {
                "shared.key": "English seed shared",
                "eng.only": "English seed only",
                "conflict.key": "English conflict value",
            },
            "lang-fra": {
                "shared.key": "French seed shared",
                "fra.only": "French seed only",
                "conflict.key": "French conflict value",
            },
        };
        const { db, inserted } = mockDb([
            {
                _id: "lang-eng",
                type: DocType.Language,
                default: 1,
                updatedTimeUtc: 1,
                translations: {
                    "shared.key": "Production English",
                    "legacy.key": "Remove me",
                },
            },
            {
                _id: "lang-fra",
                type: DocType.Language,
                updatedTimeUtc: 2,
                translations: {
                    "shared.key": "Production French",
                    "legacy.key": "Remove me too",
                },
            },
            {
                _id: "lang-spa",
                type: DocType.Language,
                updatedTimeUtc: 3,
                translations: {
                    "shared.key": "Production Spanish",
                    "legacy.key": "Remove me three",
                },
            },
        ]);

        await reconcileLanguageTranslationSeeds(db, seedTranslations);

        expect(db.processAllDocs).toHaveBeenCalledWith([DocType.Language], expect.any(Function));
        expect(inserted).toHaveLength(3);

        // lang-eng is the default language, so its reconciled translations are the placeholder
        // for the others. It keeps its own existing/seed values and is backfilled with the French
        // value for fra.only (which English's seed file doesn't define). legacy.key is pruned.
        expect(inserted.find((doc) => doc._id === "lang-eng")).toMatchObject({
            updatedTimeUtc: 123456789,
            translations: {
                "shared.key": "Production English",
                "eng.only": "English seed only",
                "fra.only": "French seed only",
                "conflict.key": "English conflict value",
            },
        });
        expect(inserted.find((doc) => doc._id === "lang-eng").translations).not.toHaveProperty(
            "legacy.key",
        );

        // lang-fra keeps its own seed values for its keys; its missing eng.only is backfilled from
        // the default language (lang-eng), never leaving a raw key.
        expect(inserted.find((doc) => doc._id === "lang-fra")).toMatchObject({
            updatedTimeUtc: 123456789,
            translations: {
                "shared.key": "Production French",
                "fra.only": "French seed only",
                "eng.only": "English seed only",
                "conflict.key": "French conflict value",
            },
        });
        expect(inserted.find((doc) => doc._id === "lang-fra").translations).not.toHaveProperty(
            "legacy.key",
        );

        // lang-spa has no seed file, so every missing key takes the default language's value.
        expect(inserted.find((doc) => doc._id === "lang-spa")).toMatchObject({
            updatedTimeUtc: 123456789,
            translations: {
                "shared.key": "Production Spanish",
                "eng.only": "English seed only",
                "fra.only": "French seed only",
                "conflict.key": "English conflict value",
            },
        });
        expect(inserted.find((doc) => doc._id === "lang-spa").translations).not.toHaveProperty(
            "legacy.key",
        );
    });

    it("uses the database's default language (default: 1) as the placeholder source", async () => {
        // French is marked default here, so the Spanish placeholder must come from French, not
        // from the hardcoded English that used to be the primary.
        const seedTranslations = {
            "lang-eng": { greeting: "Hello", farewell: "Goodbye" },
            "lang-fra": { greeting: "Bonjour", farewell: "Au revoir" },
        };
        const { db, inserted } = mockDb([
            {
                _id: "lang-fra",
                type: DocType.Language,
                default: 1,
                updatedTimeUtc: 1,
                translations: { greeting: "Bonjour (prod)" },
            },
            {
                _id: "lang-spa",
                type: DocType.Language,
                updatedTimeUtc: 2,
                translations: { greeting: "Hola (prod)" },
            },
        ]);

        await reconcileLanguageTranslationSeeds(db, seedTranslations);

        // lang-fra (the default) keeps its production greeting and backfills farewell from its
        // own seed file.
        expect(inserted.find((doc) => doc._id === "lang-fra")).toMatchObject({
            translations: { greeting: "Bonjour (prod)", farewell: "Au revoir" },
        });
        // lang-spa keeps its production greeting; the missing farewell is backfilled from the
        // default language (French), NOT from English — proving the placeholder follows the DB
        // default rather than a hardcoded lang-eng.
        expect(inserted.find((doc) => doc._id === "lang-spa")).toMatchObject({
            translations: { greeting: "Hola (prod)", farewell: "Au revoir" },
        });
        expect(inserted.find((doc) => doc._id === "lang-spa").translations.farewell).not.toBe(
            "Goodbye",
        );
    });

    it("does not write unchanged docs", async () => {
        // A doc is unchanged only when its key set already exactly matches the union of seed
        // keys (nothing to prune, nothing to backfill). Existing values are preserved as-is,
        // so the values below need not match the seed file values — only the key set matters.
        const seedTranslations = {
            "lang-eng": {
                "shared.key": "English seed shared",
                "eng.only": "English seed only",
                "conflict.key": "English conflict value",
            },
            "lang-fra": {
                "shared.key": "French seed shared",
                "fra.only": "French seed only",
                "conflict.key": "French conflict value",
            },
        };
        const { db, inserted } = mockDb([
            {
                _id: "lang-eng",
                type: DocType.Language,
                default: 1,
                updatedTimeUtc: 1,
                translations: {
                    "shared.key": "Production English",
                    "eng.only": "Production English only",
                    "fra.only": "Production English (from French fallback)",
                    "conflict.key": "Production English conflict",
                },
            },
            {
                _id: "lang-fra",
                type: DocType.Language,
                updatedTimeUtc: 2,
                translations: {
                    "shared.key": "Production French",
                    "fra.only": "Production French only",
                    "eng.only": "Production French (from English fallback)",
                    "conflict.key": "Production French conflict",
                },
            },
            {
                _id: "lang-spa",
                type: DocType.Language,
                updatedTimeUtc: 3,
                translations: {
                    "shared.key": "Production Spanish",
                    "eng.only": "Production Spanish (from English)",
                    "fra.only": "Production Spanish (from French)",
                    "conflict.key": "Production Spanish conflict",
                },
            },
        ]);

        await reconcileLanguageTranslationSeeds(db, seedTranslations);

        expect(inserted).toHaveLength(0);
        expect(db.insertDoc).not.toHaveBeenCalled();
    });

    it("warns and falls back to merged seed values when no default language document exists", async () => {
        const seedTranslations = {
            "lang-eng": { k: "English" },
            "lang-fra": { k: "French" },
        };
        const { db, inserted } = mockDb([
            {
                _id: "lang-eng",
                type: DocType.Language,
                updatedTimeUtc: 1,
                translations: { k: "Prod English" },
            },
            {
                _id: "lang-spa",
                type: DocType.Language,
                updatedTimeUtc: 2,
                translations: {},
            },
        ]);

        await reconcileLanguageTranslationSeeds(db, seedTranslations);

        expect(Logger.prototype.warn).toHaveBeenCalledWith(
            expect.stringContaining("found no default language document"),
        );
        // lang-eng is already complete, so it is not rewritten; lang-spa gets the merged seed
        // fallback (English, the alphabetically-first seed language) for the missing key.
        expect(inserted).toHaveLength(1);
        expect(inserted.find((doc) => doc._id === "lang-spa")).toMatchObject({
            translations: { k: "English" },
        });
    });
});