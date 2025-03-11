import { DbService } from "../../db/db.service";
import { DocType } from "../../enums";
import { LanguageDto } from "../../dto/LanguageDto";
import processLanguageDto from "./processLanguageDto";

describe("processLanguageDto", () => {
    let db: DbService;

    beforeEach(() => {
        db = {
            getDocsByType: jest.fn(),
            upsertDoc: jest.fn(),
            getContentByLanguage: jest.fn(),
        } as unknown as DbService;
    });

    it("throws an error if a default language document is marked for deletion", async () => {
        const doc: LanguageDto = {
            _id: "lang-eng",
            type: DocType.Language,
            languageCode: "eng",
            name: "English",
            default: 1,
            deleteReq: 1,
            translations: {},
            memberOf: [],
        };

        await expect(processLanguageDto(doc, db)).rejects.toThrow(
            "Cannot delete the default language document",
        );
    });

    it("sets all other language documents as non-default if a language document is set as default", async () => {
        const doc: LanguageDto = {
            _id: "lang-eng",
            type: DocType.Language,
            languageCode: "eng",
            name: "English",
            default: 1,
            translations: {},
            memberOf: [],
        };

        const otherLanguageDoc: LanguageDto = {
            _id: "lang-fra",
            type: DocType.Language,
            languageCode: "fra",
            name: "French",
            default: 1,
            translations: {},
            memberOf: [],
        };

        (db.getDocsByType as jest.Mock).mockResolvedValue({ docs: [doc, otherLanguageDoc] });

        await processLanguageDto(doc, db);

        expect(db.getDocsByType).toHaveBeenCalledWith(DocType.Language);
        expect(db.upsertDoc).toHaveBeenCalled(); //toHaveBeenCalledWith({ ...otherLanguageDoc, default: 0 });
    });

    it("throws an error if a language document is marked for deletion and is in use by content documents", async () => {
        const doc: LanguageDto = {
            _id: "lang-eng",
            type: DocType.Language,
            languageCode: "eng",
            name: "English",
            deleteReq: 1,
            translations: {},
            memberOf: [],
        };

        (db.getContentByLanguage as jest.Mock).mockResolvedValue({ docs: [{}] });

        await expect(processLanguageDto(doc, db)).rejects.toThrow(
            "Cannot delete a language document that is in use by content documents",
        );
    });

    it("does not throw an error if a language document is marked for deletion and is not in use by content documents", async () => {
        const doc: LanguageDto = {
            _id: "lang-eng",
            type: DocType.Language,
            languageCode: "eng",
            name: "English",
            deleteReq: 1,
            translations: {},
            memberOf: [],
        };

        (db.getContentByLanguage as jest.Mock).mockResolvedValue({ docs: [] });

        await expect(processLanguageDto(doc, db)).resolves.not.toThrow();
    });
});
