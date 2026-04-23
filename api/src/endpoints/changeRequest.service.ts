import { ChangeReqDto } from "../dto/ChangeReqDto";
import { Injectable, Inject } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { AckStatus, AclPermission, DocType, USER_DATA_DOC_TYPES, Uuid } from "../enums";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { JwtUserDetails } from "../auth/authIdentity.service";
import configuration, { Configuration } from "../configuration";
import { processChangeRequest } from "../changeRequests/processChangeRequest";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";
import { PermissionSystem } from "../permissions/permissions.service";
import { UserDbService } from "../userdata/userDb.service";
import { UserContentDto } from "../dto/UserContentDto";
import { UserSettingsDto } from "../dto/UserSettingsDto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

@Injectable()
export class ChangeRequestService {
    private readonly test: any = [];
    private permissionMap: any;
    private config: Configuration;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
        private userDb: UserDbService,
    ) {
        // Create config object with environmental variables
        this.config = configuration();
    }

    async changeRequest(
        changeRequest: ChangeReqDto,
        userDetails: JwtUserDetails,
    ): Promise<ChangeReqAckDto> {
        // Route user-data writes to the partitioned userdata DB. These
        // docs have fundamentally different permissions (partition
        // ownership, not group ACLs) so they bypass the content change-
        // request pipeline entirely. Reuses the same ack shape so the
        // client's localChanges / syncLocalChanges path works uniformly.
        const docType = changeRequest?.doc?.type;
        if (docType && USER_DATA_DOC_TYPES.includes(docType)) {
            return this.userDataChangeRequest(changeRequest, userDetails);
        }

        // Process change request
        return await processChangeRequest(
            userDetails.userId,
            changeRequest,
            userDetails.groups,
            this.db,
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

    /**
     * Handle a change request for a user-data doc (UserContent /
     * UserSettings). Validates the DTO, enforces partition ownership
     * via the authenticated userId, and routes to UserDbService.
     *
     * Deletes flow through the same path: if `doc.deleteReq` is set,
     * the doc is soft-deleted in the partition instead of upserted —
     * matches how content deletes are signalled in this codebase.
     */
    private async userDataChangeRequest(
        changeRequest: ChangeReqDto,
        userDetails: JwtUserDetails,
    ): Promise<ChangeReqAckDto> {
        if (!userDetails.userId) {
            return {
                ack: AckStatus.Rejected,
                message: "Authenticated user required for user-data writes",
            };
        }
        const userId = userDetails.userId;

        // Force partition ownership onto the doc regardless of what the
        // client sent. UserDbService re-validates, so a client that
        // submitted another user's _id still gets rejected — this is
        // just the first line of defence.
        const incoming = { ...changeRequest.doc, userId };

        try {
            const validated = await this.validateUserDataDoc(incoming);

            if (incoming.deleteReq) {
                await this.userDb.softDeleteInPartition(userId, validated._id);
            } else {
                await this.userDb.upsertInPartition(userId, validated);
            }

            return { ack: AckStatus.Accepted };
        } catch (err) {
            return {
                ack: AckStatus.Rejected,
                message: err?.message || "User-data change request failed",
            };
        }
    }

    private async validateUserDataDoc(raw: any): Promise<UserContentDto | UserSettingsDto> {
        let dto: UserContentDto | UserSettingsDto;
        if (raw.type === DocType.UserContent) {
            dto = plainToInstance(UserContentDto, raw, { excludeExtraneousValues: true });
        } else if (raw.type === DocType.UserSettings) {
            dto = plainToInstance(UserSettingsDto, raw, { excludeExtraneousValues: true });
        } else {
            throw new Error(`Unsupported user-data type: ${raw.type}`);
        }

        // Defensive defaults for a brand-new doc whose client forgot to
        // set these. Every other field comes through plainToInstance
        // naturally via its @Expose decorator — we deliberately do not
        // re-apply `_rev` from the raw payload because it's server-
        // controlled (UserDbService reads the current doc's _rev on
        // merge-on-write; a client-supplied value would be ignored).
        if (dto.createdAt === undefined) dto.createdAt = Date.now();
        if (dto.updatedTimeUtc === undefined) dto.updatedTimeUtc = Date.now();

        const errors = await validate(dto);
        if (errors.length > 0) {
            const paths = errors.map((e) => e.property).filter(Boolean);
            throw new Error(
                paths.length > 0
                    ? `Invalid fields: ${paths.join(", ")}`
                    : "Invalid user-data payload",
            );
        }
        return dto;
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
