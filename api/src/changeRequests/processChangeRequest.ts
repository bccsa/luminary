import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType, Uuid } from "../enums";
import { validateSlug } from "./validateSlug";
import { processImage } from "../s3/s3.imagehandling";
import { S3Service } from "../s3/s3.service";
import { PostDto } from "src/dto/PostDto";
import { TagDto } from "src/dto/TagDto";
import { ContentDto } from "src/dto/ContentDto";
import { LanguageDto } from "src/dto/LanguageDto";

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

            if (parentDoc.type == DocType.Post) {
                contentDoc.parentPostType = (parentDoc as PostDto).postType;
            }

            if (parentDoc.type == DocType.Tag) {
                contentDoc.parentTagType = (parentDoc as TagDto).tagType;
                contentDoc.parentPinned = (parentDoc as TagDto).pinned;
            }
            contentDoc.parentPublishDateVisible = parentDoc.publishDateVisible;
        }
    }

    if (doc.type == DocType.Post || doc.type == DocType.Tag) {
        const prevDoc = await db.getDoc(doc._id);

        // Process image uploads
        if ((doc as PostDto).imageData) {
            const prevImageData = prevDoc.docs.length > 0 ? prevDoc.docs[0].imageData : undefined;
            await processImage(doc.imageData, prevImageData, s3);
            delete doc.image; // Remove the legacy image field
        }

        // Get content documents that are children of the Post / Tag document
        // and copy essential properties from the Post / Tag document to the child content document
        const contentDocs = await db.getContentByParentId(doc._id);
        for (const contentDoc of contentDocs.docs) {
            contentDoc.memberOf = doc.memberOf;
            contentDoc.parentTags = doc.tags;
            contentDoc.parentImageData = doc.imageData;

            if (doc.type == DocType.Post) {
                contentDoc.parentPostType = (doc as PostDto).postType;
            }

            if (doc.type == DocType.Tag) {
                contentDoc.parentTagType = (doc as TagDto).tagType;
                contentDoc.parentPinned = (doc as TagDto).pinned;
            }

            contentDoc.parentPublishDateVisible = doc.publishDateVisible;
            await db.upsertDoc(contentDoc);
        }

        // tag caching to the taggedDocs / parentTaggedDocs property of tag / content documents. This is done to improve client query performance.
        const prevTags = prevDoc.docs.length ? (prevDoc.docs[0] as PostDto | TagDto).tags : [];
        const addedTags = (doc as PostDto | TagDto).tags.filter((tag) => !prevTags.includes(tag));
        const removedTags = prevTags.filter((tag) => !(doc as PostDto | TagDto).tags.includes(tag));
        const changedTags = addedTags
            .concat(removedTags)
            .filter((tag, index, self) => self.indexOf(tag) === index);
        const tagDocs = changedTags.length
            ? (await db.getDocs(changedTags, [DocType.Tag])).docs
            : [];
        const tagDocsContent = changedTags.length
            ? (await db.getContentByParentId(changedTags)).docs
            : [];
        const updatedDocs = tagDocs.concat(tagDocsContent);

        for (const d of updatedDocs) {
            let taggedDocsArray: Uuid[];
            let tagId: Uuid;
            if (d.type == DocType.Tag) {
                const tag = d as TagDto;
                tag.taggedDocs = tag.taggedDocs || [];
                taggedDocsArray = tag.taggedDocs;
                tagId = tag._id;
            } else {
                const content = d as ContentDto;
                content.parentTaggedDocs = content.parentTaggedDocs || [];
                taggedDocsArray = content.parentTaggedDocs;
                tagId = content.parentId;
            }

            if (addedTags.includes(tagId)) taggedDocsArray.push(doc._id);

            if (removedTags.includes(tagId)) {
                const index = taggedDocsArray.indexOf(doc._id);
                if (index > -1) taggedDocsArray.splice(index, 1);
            }

            await db.upsertDoc(d);
        }
    }

    if (doc.type === DocType.Language) {
        const langDoc = doc as LanguageDto;
        if (langDoc.default == 1) {
            const languageDocs = await db.getDocsByType(DocType.Language);

            languageDocs.docs.forEach((doc: LanguageDto) => {
                if (doc.type === DocType.Language) {
                    if (langDoc._id == doc._id) return;
                    doc.memberOf.forEach(async (member) => {
                        if (groupMembership.includes(member)) {
                            doc.default = 0;
                            await db.upsertDoc(doc);
                        }
                    });
                }
            });
        }
    }

    // Insert / update the document in the database
    const upsertResult = await db.upsertDoc(doc);

    // TODO: Reactivate change diffs in change requests - https://github.com/bccsa/luminary/issues/442

    return upsertResult;
}
