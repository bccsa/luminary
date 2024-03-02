import { randomUUID } from "crypto";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { ChangeDto } from "../dto/ChangeDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType, Uuid } from "../enums";

export async function processChangeRequest(
    userId: string,
    changeRequest: ChangeReqDto,
    groupMembership: Array<Uuid>,
    db: DbService,
) {
    // Validate change request
    const validationResult = await validateChangeRequest(changeRequest, groupMembership, db);
    if (!validationResult.validated) {
        throw new Error(validationResult.error);
    }

    const upsertResult = await db.upsertDoc(validationResult.validatedData);

    // Generate change document and store in database
    if (upsertResult.changes) {
        const changeDoc = new ChangeDto();
        changeDoc._id = "change:" + randomUUID();
        changeDoc.type = DocType.Change;
        changeDoc.docId = validationResult.validatedData._id;
        changeDoc.docType = validationResult.validatedData.type;
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

        return db.insertDoc(changeDoc);
    }

    return upsertResult;
}
