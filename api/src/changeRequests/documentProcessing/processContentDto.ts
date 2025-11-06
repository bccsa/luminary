import { ContentDto } from "../../dto/ContentDto";
import { validateSlug } from "../validateSlug";
import { PostDto } from "../../dto/PostDto";
import { TagDto } from "../../dto/TagDto";
import { DbService } from "../../db/db.service";
import { DocType, PublishStatus, Uuid } from "../../enums";

/**
 * Process Content DTO
 * @param doc
 * @param db
 */
export default async function processContentDto(doc: ContentDto, db: DbService) {
    doc.slug = await validateSlug(doc.slug, doc._id, db);

    const parentQuery = await db.getDoc(doc.parentId);
    const parentDoc: PostDto | TagDto | undefined =
        parentQuery.docs.length > 0 ? parentQuery.docs[0] : undefined;

    // Copy essential properties from Post / Tag documents to Content documents
    if (parentDoc) {
        doc.memberOf = parentDoc.memberOf;
        doc.parentTags = parentDoc.tags;
        doc.parentImageData = parentDoc.imageData;
        doc.parentMedia = parentDoc.media;

        if (parentDoc.type == DocType.Post) {
            doc.parentPostType = (parentDoc as PostDto).postType;
        }

        if (parentDoc.type == DocType.Tag) {
            doc.parentTagType = (parentDoc as TagDto).tagType;
            doc.parentPinned = (parentDoc as TagDto).pinned;
            doc.parentTaggedDocs = (parentDoc as TagDto).taggedDocs;
        }
        doc.parentPublishDateVisible = parentDoc.publishDateVisible;
    }

    // Find all available translations, and add them to the content document's availableTranslations property
    const translationsQuery = await db.getContentByParentId(parentDoc._id);
    const translations = translationsQuery.docs.filter((d) => d._id !== doc._id);
    const uniqueLanguages = new Set<Uuid>(translations.map((d) => d.language));

    // If this content doc is published, add its language to the list of available translations
    if (doc.status == PublishStatus.Published) uniqueLanguages.add(doc.language);

    // Remove the current document's language from the list of available translations if the document is being deleted
    if (doc.deleteReq) uniqueLanguages.delete(doc.language);

    const availableTranslations = Array.from(uniqueLanguages);
    doc.availableTranslations = availableTranslations;

    // Update all translations with the new list of available translations
    for (const t of translations) {
        t.availableTranslations = availableTranslations;
        await db.upsertDoc(t);
    }
}
