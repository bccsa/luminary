import { ChangeReqDto } from "../dto/ChangeReqDto";
import { Injectable, Inject } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { AckStatus, AclPermission, DocType, Uuid } from "../enums";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { processJwt } from "../jwt/processJwt";
import configuration, { Configuration } from "../configuration";
import { processChangeRequest } from "../changeRequests/processChangeRequest";
import { S3Service } from "../s3/s3.service";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { PermissionSystem } from "../permissions/permissions.service";
import { Socketio } from "src/socketio";

@Injectable()
export class ChangeRequestService {
    private readonly test: any = [];
    private permissionMap: any;
    private config: Configuration;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
        private s3: S3Service,
        private socket: Socketio,
    ) {
        // Create config object with environmental variables
        this.config = configuration();
    }

    async changeRequest(changeRequest: ChangeReqDto, token: string): Promise<ChangeReqAckDto> {
        const userDetails = await processJwt(token, this.db, this.logger);

        // Process change request
        return await processChangeRequest(
            userDetails.userId,
            changeRequest,
            userDetails.groups,
            this.db,
            this.s3,
            this.socket,
        )
            .then(async (result) => {
                const ack = await this.upsertDocAck(
                    changeRequest,
                    AckStatus.Accepted,
                    userDetails.groups,
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
                    userDetails.groups,
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
        if (!changeRequest) changeRequest = { id: undefined, doc: undefined, apiVersion: "0.0.0" };

        const ack: ChangeReqAckDto = {
            id: changeRequest.id,
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
