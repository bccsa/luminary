import { Logger } from "@nestjs/common";
import { DocType } from "../enums";
import { reconcileLanguageTranslationSeeds } from "./languageTranslationSeedReconciliation";

describe("reconcileLanguageTranslationSeeds", () => {
    const seedTranslations = {
        "lang-eng": {
            "shared.key": "English seed shared",
            "eng.only": "English seed only",
        },
        "lang-fra": {
            "shared.key": "French seed shared",
            "fra.only": "French seed only",
        },
    };

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

    it("adds seeded English/French keys, preserves existing values, and prunes extras", async () => {
        const { db, inserted } = mockDb([
            {
                _id: "lang-eng",
                type: DocType.Language,
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

        expect(inserted.find((doc) => doc._id === "lang-eng")).toMatchObject({
            updatedTimeUtc: 123456789,
            translations: {
                "shared.key": "Production English",
                "eng.only": "English seed only",
            },
        });
        expect(inserted.find((doc) => doc._id === "lang-eng").translations).not.toHaveProperty(
            "fra.only",
        );
        expect(inserted.find((doc) => doc._id === "lang-eng").translations).not.toHaveProperty(
            "legacy.key",
        );

        expect(inserted.find((doc) => doc._id === "lang-fra")).toMatchObject({
            updatedTimeUtc: 123456789,
            translations: {
                "shared.key": "Production French",
                "fra.only": "French seed only",
            },
        });
        expect(inserted.find((doc) => doc._id === "lang-fra").translations).not.toHaveProperty(
            "eng.only",
        );
        expect(inserted.find((doc) => doc._id === "lang-fra").translations).not.toHaveProperty(
            "legacy.key",
        );

        expect(inserted.find((doc) => doc._id === "lang-spa")).toMatchObject({
            updatedTimeUtc: 123456789,
            translations: {
                "shared.key": "Production Spanish",
            },
        });
        expect(inserted.find((doc) => doc._id === "lang-spa").translations).not.toHaveProperty(
            "eng.only",
        );
        expect(inserted.find((doc) => doc._id === "lang-spa").translations).not.toHaveProperty(
            "fra.only",
        );
        expect(inserted.find((doc) => doc._id === "lang-spa").translations).not.toHaveProperty(
            "legacy.key",
        );
    });

    it("does not write unchanged docs", async () => {
        const { db, inserted } = mockDb([
            {
                _id: "lang-eng",
                type: DocType.Language,
                updatedTimeUtc: 1,
                translations: {
                    "shared.key": "Production English",
                    "eng.only": "Production English only",
                },
            },
            {
                _id: "lang-fra",
                type: DocType.Language,
                updatedTimeUtc: 2,
                translations: {
                    "shared.key": "Production French",
                    "fra.only": "Production French only",
                },
            },
        ]);

        await reconcileLanguageTranslationSeeds(db, seedTranslations);

        expect(inserted).toHaveLength(0);
        expect(db.insertDoc).not.toHaveBeenCalled();
    });
});
