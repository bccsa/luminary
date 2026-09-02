import {
    db,
    DocType,
    PublishStatus,
    type ContentDto,
    type ContentParentDto,
    type TagDto,
} from "luminary-shared";
import * as _ from "lodash";

/** What happened to the source image when building the duplicate. */
export type DuplicateImageOutcome = "copied" | "skipped" | "none";

/**
 * Build unsaved duplicate clones of a content parent and its translations: fresh ids,
 * stripped `_rev`, drafted + "(Copy)"/"-copy"-suffixed children. Returns new objects;
 * the inputs are not mutated.
 *
 * `duplicateImage` names the source on the clone so the API can copy its image across. The
 * source bucket and files are resolved server-side, so a stale or missing local bucket
 * reference cannot lose the image.
 */
export function buildContentDuplicate(
    parent: ContentParentDto,
    content: ContentDto[],
    options: { duplicateImage: boolean },
): { parent: ContentParentDto; content: ContentDto[]; imageOutcome: DuplicateImageOutcome } {
    const clonedParent = _.cloneDeep(parent);
    clonedParent._id = db.uuid();
    delete (clonedParent as any)._rev;
    if (clonedParent.type === DocType.Tag) (clonedParent as TagDto).taggedDocs = [];

    let imageOutcome: DuplicateImageOutcome = "none";

    if (clonedParent.imageData) {
        const imageData = clonedParent.imageData;
        delete imageData.uploadData;
        delete imageData.duplicate;
        delete imageData.duplicateFrom;
        if (imageData.fileCollections?.length > 0 && options.duplicateImage) {
            imageData.duplicateFrom = parent._id;
            imageOutcome = "copied";
        } else if (imageData.fileCollections?.length > 0) {
            imageData.fileCollections = [];
            imageOutcome = "skipped";
        } else if (imageData.fileCollections) {
            imageData.fileCollections = [];
        }
    }

    const clonedContent = content.map((c) => {
        const newContent = _.cloneDeep(c);
        newContent._id = db.uuid();
        delete (newContent as any)._rev;
        newContent.updatedTimeUtc = Date.now();
        newContent.title += " (Copy)";
        newContent.slug += "-copy";
        newContent.parentId = clonedParent._id;
        newContent.parentType = parent.type as DocType.Post | DocType.Tag;
        newContent.status = PublishStatus.Draft;
        newContent.parentTags = [];
        newContent.parentTaggedDocs = [];
        return newContent;
    });

    return { parent: clonedParent, content: clonedContent, imageOutcome };
}
