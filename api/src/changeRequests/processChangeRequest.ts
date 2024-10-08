import { randomUUID } from "crypto";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { ChangeDto } from "../dto/ChangeDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType, Uuid } from "../enums";
import { validateSlug } from "./validateSlug";
import { processImage } from "../s3/s3.imagehandling";
import { S3Service } from "../s3/s3.service";
import { PostDto } from "src/dto/PostDto";
import { TagDto } from "src/dto/TagDto";
import { ContentDto } from "src/dto/ContentDto";

export async function processChangeRequest(
    userId: string,
    changeRequest: ChangeReqDto,
    groupMembership: Array<Uuid>,
    db: DbService,
    s3: S3Service,
) {
    // Validate change request
    const validationResult = await validateChangeRequest(changeRequest, groupMembership, db);
    if (!validationResult.validated) {
        throw new Error(validationResult.error);
    }

    const doc = validationResult.validatedData;

    // Validate slug
    if (doc.type == DocType.Content) {
        doc.slug = await validateSlug(doc.slug, doc._id, db);
    }

    // Copy essential properties from Post / Tag documents to Content documents
    if (doc.type == DocType.Content) {
        const parentQuery = await db.getDoc(doc.parentId);
        const parentDoc: PostDto | TagDto | undefined =
            parentQuery.docs.length > 0 ? parentQuery.docs[0] : undefined;

        if (parentDoc) {
            const contentDoc = doc as ContentDto;
            contentDoc.memberOf = parentDoc.memberOf;
            contentDoc.parentTags = parentDoc.tags;
            contentDoc.parentImageData = parentDoc.imageData;

            if (parentDoc.type == DocType.Tag) {
                contentDoc.parentTagType = (parentDoc as TagDto).tagType;
            }

            if (parentDoc.type == DocType.Post) {
                contentDoc.parentTagType = (parentDoc as PostDto).postType;
            }
            contentDoc.parentPublishDateVisible = parentDoc.publishDateVisible;
        }
    }

    if (doc.type == DocType.Post || doc.type == DocType.Tag) {
        // Process image uploads
        if ((doc as PostDto).imageData) {
            const prevDoc = await db.getDoc(doc._id);
            const prevImageData = prevDoc.docs.length > 0 ? prevDoc.docs[0].imageData : undefined;
            await processImage(doc.imageData, prevImageData, s3);
            delete doc.image; // Remove the legacy image field
        }

        // Get content documents that are children of the Post / Tag document
        await db.getContentByParentId(doc._id).then((contentDocs) => {
            // Copy essential properties from the Post / Tag document to the child content document
            contentDocs.docs.forEach(async (contentDoc: ContentDto) => {
                contentDoc.memberOf = doc.memberOf;
                contentDoc.parentTags = doc.tags;
                contentDoc.parentImageData = doc.imageData;

                if (doc.type == DocType.Tag) {
                    contentDoc.parentTagType = (doc as TagDto).tagType;
                }

                if (doc.type == DocType.Post) {
                    contentDoc.parentTagType = (doc as PostDto).postType;
                }

                contentDoc.parentPublishDateVisible = doc.publishDateVisible;
                await db.upsertDoc(contentDoc);
            });
        });
    }

    // Insert / update the document in the database
    const upsertResult = await db.upsertDoc(doc);

    // Generate change document and store in database
    if (upsertResult.changes) {
        const changeDoc = new ChangeDto();
        changeDoc._id = "change:" + randomUUID();
        changeDoc.type = DocType.Change;
        changeDoc.docId = doc._id;
        changeDoc.docType = doc.type;
        changeDoc.updatedTimeUtc = upsertResult.updatedTimeUtc;
        changeDoc.changes = upsertResult.changes;
        changeDoc.changedByUser = userId;

        // Apply the group membership or ACL of the included document to the change document
        if (upsertResult.changes.memberOf) {
            changeDoc.memberOf = upsertResult.changes.memberOf;
        }
        if (upsertResult.changes.acl) {
            changeDoc.acl = upsertResult.changes.acl;
        }

        // Apply the parentId of the included document to the change document
        if (upsertResult.changes.parentId) {
            changeDoc.parentId = upsertResult.changes.parentId;
        }

        // Apply the language of the included document to the change document
        if (upsertResult.changes.language) {
            changeDoc.language = upsertResult.changes.language;
        }

        return db.insertDoc(changeDoc);
    }

    return upsertResult;
}
