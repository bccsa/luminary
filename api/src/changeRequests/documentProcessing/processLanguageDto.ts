import { DbService } from "../../db/db.service";
import { DocType } from "../../enums";
import { LanguageDto } from "../../dto/LanguageDto";

/**
 * Process Language DTO
 * @param doc
 * @param db
 */
export default async function processLanguageDto(doc: LanguageDto, db: DbService) {
    // Reject if a language document is deleted with the default language field set
    if (doc.deleteReq && doc.default) {
        throw new Error("Cannot delete the default language document");
    }

    // If a language document is set as the default, set all other language documents as non-default
    if (doc.default) {
        const languageDocs = await db.getDocsByType(DocType.Language);

        languageDocs.docs.forEach(async (d: LanguageDto) => {
            if (d._id == doc._id) return;
            await db.upsertDoc({ ...d, default: 0 });
        });
    }

    // Throw an error if the language document is set to be deleted and there are content documents that use the language
    if (doc.deleteReq) {
        const contentDocs = await db.getContentByLanguage(doc._id, 1);
        if (contentDocs.docs.length) {
            throw new Error(
                "Cannot delete a language document that is in use by content documents",
            );
        }
    }
}
