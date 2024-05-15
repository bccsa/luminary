import { randomUUID } from "crypto";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { ChangeDto } from "../dto/ChangeDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType, Uuid } from "../enums";
import { validateSlug } from "./validateSlug";
import { processImage } from "../s3/s3.imagehandling";
import { S3Service } from "../s3/s3.service";

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

    let doc = validationResult.validatedData;

    // Validate slug
    if (doc.type == DocType.Content) {
        doc.slug = await validateSlug(doc.slug, doc._id, db);
    }

    // Process image uploads
    if (doc.type == DocType.Image) {
        const prevDoc = await db.getDoc(doc._id);
        doc = await processImage(doc, prevDoc.docs.length > 0 ? prevDoc.docs[0] : undefined, s3);
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
