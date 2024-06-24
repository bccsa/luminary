import { ContentDto } from "src/dto/ContentDto";
import { DbService } from "../db/db.service";
import { ContentMetadataDto } from "../dto/ContentMetadataDto";
import { Uuid } from "../enums";
import { Logger } from "winston";

/**
 * Generate metadata for a post or tag document containing essential information about the content documents.
 * This is used to improve query performance on the frontend.
 */
export async function generatePostTagMetadata(db: DbService, logger: Logger, parentId: Uuid) {
    // Get content documents belonging to the post / tag document
    const content = await db.getContentByParentId(parentId);

    content.warnings?.forEach((warning) => {
        logger.warn(warning);
    });

    const metadata: ContentMetadataDto[] = [];
    content.docs.forEach((doc: ContentDto) => {
        const metaEntry = new ContentMetadataDto();
        metaEntry.contentId = doc._id;
        metaEntry.languageId = doc.language;
        metaEntry.title = doc.title;
        metaEntry.status = doc.status;
        metaEntry.publishDate = doc.publishDate;
        metaEntry.expiryDate = doc.expiryDate;

        metadata.push(metaEntry);
    });

    return metadata;
}
