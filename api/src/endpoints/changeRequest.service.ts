import { ChangeReqDto } from "../dto/ChangeReqDto";
import { Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { AckStatus, AclPermission, DocType, Uuid } from "../enums";
import { ResolvedIdentity } from "../auth/auth-identity.service";
import { processChangeRequest } from "../changeRequests/processChangeRequest";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { PermissionSystem } from "../permissions/permissions.service";

@Injectable()
export class ChangeRequestService {
    constructor(private db: DbService) {}

    async changeRequest(changeRequest: ChangeReqDto, identity: ResolvedIdentity): Promise<ChangeReqAckDto> {
        const userId = identity.user.userId || identity.user._id;
        const groups = identity.groupIds as Uuid[];

        // Process change request
        return await processChangeRequest(
            userId,
            changeRequest,
            groups,
            this.db,
        )
            .then(async (result) => {
                const ack = await this.upsertDocAck(
                    changeRequest,
                    AckStatus.Accepted,
                    groups,
                );

                // Add warnings to the acknowledgment if any
                if (result.warnings && result.warnings.length > 0) {
                    ack.warnings = result.warnings;
                }

                return ack;
            })
            .catch(async (err) => {
                return await this.upsertDocAck(
                    changeRequest,
                    AckStatus.Rejected,
                    groups,
                    err.message,
                );
            });
    }

    async upsertDocAck(
        changeRequest: ChangeReqDto,
        status: AckStatus,
        memberOf: Uuid[],
        message?: string,
    ): Promise<ChangeReqAckDto> {
        if (!changeRequest) changeRequest = { doc: undefined, apiVersion: "0.0.0" };

        const ack: ChangeReqAckDto = {
            ack: status,
        };

        if (message && status == AckStatus.Rejected) {
            ack.message = message;
        }

        if (changeRequest.doc && status == AckStatus.Rejected) {
            await this.db.getDoc(changeRequest.doc._id).then((res) => {
                if (res.docs.length > 0) {
                    ack.docs = [res.docs[0]];
                }
            });

            // Handle rejected Post / Tag requests
            if (
                changeRequest.doc.type == DocType.Post ||
                (changeRequest.doc.type == DocType.Tag && changeRequest.doc.deleteReq)
            ) {
                // Get all content documents associated to the post/tag to which the user has view access
                const res = await this.db.getContentByParentId(changeRequest.doc._id);
                const contentDocs = res.docs.filter((doc) =>
                    PermissionSystem.verifyAccess(
                        doc.memberOf,
                        changeRequest.doc.type,
                        AclPermission.View,
                        memberOf,
                        "any",
                    ),
                );
                if (contentDocs.length > 0) {
                    ack.docs.push(...contentDocs);
                }
            }
        }
        return ack;
    }
}
