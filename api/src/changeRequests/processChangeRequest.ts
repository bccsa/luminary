import { randomUUID } from "crypto";
import { validateChangeRequest } from "./validateChangeRequest";
import { DbService } from "../db/db.service";
import { ChangeDto } from "../dto/ChangeDto";
import { ChangeReqDto } from "../dto/ChangeReqDto";
import { DocType } from "../enums";
import { AccessMap } from "../permissions/AccessMap";

export async function processChangeRequest(
    userId: string,
    changeRequest: ChangeReqDto,
    userAccessMap: AccessMap,
    db: DbService,
) {
    // Validate change request
    const validationResult = await validateChangeRequest(changeRequest, userAccessMap, db);
    if (!validationResult.validated) {
        throw new Error(validationResult.error);
    }

    const upsertResult = await db.upsertDoc(changeRequest.doc);

    // Generate change document and store in database
    if (upsertResult.changes) {
        const changeDoc = new ChangeDto();
        changeDoc._id = "change:" + randomUUID();
        changeDoc.type = DocType.Change;
        changeDoc.docId = changeRequest.doc._id;
        changeDoc.docType = changeRequest.doc.type;
        changeDoc.updatedTimeUtc = upsertResult.updatedTimeUtc;
        changeDoc.changes = upsertResult.changes;
        changeDoc.changedByUser = userId;

        if (upsertResult.changes.memberOf) {
            changeDoc.memberOf = upsertResult.changes.memberOf;
        }

        if (upsertResult.changes.acl) {
            changeDoc.acl = upsertResult.changes.acl;
        }

        return db.insertDoc(changeDoc);
    }
}
