import {
    db,
    DocType,
    PublishStatus,
    type ContentDto,
    type ContentParentDto,
    type TagDto,
} from "luminary-shared";
import * as _ from "lodash";

/**
 * What happened to the source image when building the duplicate.
 * `noSourceBucket` is a failure the caller must surface — the source has image files but no
 * bucket to copy them from, so the duplicate is created without an image.
 */
export type DuplicateImageOutcome = "copied" | "skipped" | "none" | "noSourceBucket";

/**
 * Build unsaved duplicate clones of a content parent and its translations: fresh ids,
 * stripped `_rev`, drafted + "(Copy)"/"-copy"-suffixed children. Returns new objects;
 * the inputs are not mutated.
 *
 * `duplicateImage` carries over a copyable image collection — only possible when the
 * source actually has an image bucket; otherwise the collection is cleared and the
 * returned `imageOutcome` says why.
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
        const imageData = clonedParent.imageData as typeof clonedParent.imageData & {
            duplicate?: boolean;
        };
        delete clonedParent.imageData.uploadData;
        delete imageData.duplicate;
        if (imageData.fileCollections?.length > 0) {
            if (!options.duplicateImage) {
                imageData.fileCollections = [];
                imageOutcome = "skipped";
            } else if (parent.imageBucketId) {
                imageData.duplicate = true;
                imageOutcome = "copied";
            } else {
                imageData.fileCollections = [];
                imageOutcome = "noSourceBucket";
            }
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
