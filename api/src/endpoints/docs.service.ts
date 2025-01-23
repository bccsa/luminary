import { ChangeReqDto, DocsReqDto } from "../dto/EndpointsReqDto";
import { HttpException, HttpStatus, Injectable, Inject } from "@nestjs/common";
import { DbQueryResult, DbService, GetDocsOptions } from "../db/db.service";
import { AckStatus, AclPermission } from "../enums";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { getJwtPermission, parsePermissionMap } from "../jwt/jwtPermissionMap";
import * as JWT from "jsonwebtoken";
import configuration, { Configuration } from "../configuration";
import { validateJWT } from "../validation/jwt";
import { processChangeRequest } from "../changeRequests/processChangeRequest";
import { S3Service } from "../s3/s3.service";
import { ChangeReqAckDto } from "../dto/ChangeReqAckDto";

@Injectable()
export class DocsService {
    private readonly test: any = [];
    private permissionMap: any;
    private config: Configuration;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
        private s3: S3Service,
    ) {
        // Create config object with environmental variables
        this.config = configuration();
    }

    /**
     * Process api docs request
     * @param req - api request
     * @returns
     */
    async processReq(req: DocsReqDto, token: string): Promise<DbQueryResult> {
        // decode and validate JWT
        const jwt: string | JWT.JwtPayload = validateJWT(
            token,
            this.config.auth.jwtSecret,
            this.logger,
        );

        // Get group access
        this.permissionMap = parsePermissionMap(this.config.permissionMap, this.logger);
        const permissions = getJwtPermission(jwt, this.permissionMap, this.logger);
        const accessMap: AccessMap = PermissionSystem.getAccessMap(permissions.groups);

        // Determine which doc types to get
        const docTypes: Array<any> = [];
        if (req.docTypes)
            req.docTypes.forEach((docType) => {
                if (!docTypes.includes(docType.type)) docTypes.push(docType.type);
            });

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            accessMap,
            AclPermission.View,
            docTypes,
        );

        // validate if user has access to requested groups
        if (!userViewGroups[req.type]?.includes(req.group) && req.type !== "group") {
            throw new HttpException(
                "You do not have access to requested group",
                HttpStatus.FORBIDDEN,
            );
        }

        let from = 0;
        if (req.gapEnd && typeof req.gapEnd === "number") from = req.gapEnd;
        let to = await this.db.getLatestDocUpdatedTime();
        if (req.gapStart && typeof req.gapStart === "number") to = req.gapStart;

        const query: GetDocsOptions = {
            userAccess: userViewGroups,
            type: req.type,
            contentOnly: req.contentOnly,
            group: req.group,
        };
        if (from !== undefined) query.from = from;
        if (to !== undefined) query.to = to;

        let _res = undefined;
        await this.db
            .getDocsPerTypePerGroup(query)
            .then((res: DbQueryResult) => {
                if (res.docs) {
                    _res = res;
                }
            })
            .catch((err) => {
                this.logger.error(`Error getting data for client: ${permissions.userId}`, err);
            });
        return _res;
    }

    async upsertDoc(changeRequest: ChangeReqDto, token: string): Promise<ChangeReqAckDto> {
        // decode and validate JWT
        const jwt: string | JWT.JwtPayload = validateJWT(
            token,
            this.config.auth.jwtSecret,
            this.logger,
        );

        // Get group access
        this.permissionMap = parsePermissionMap(this.config.permissionMap, this.logger);
        const permissions = getJwtPermission(jwt, this.permissionMap, this.logger);

        // Process change request
        return await processChangeRequest(
            permissions.userId,
            changeRequest,
            permissions.groups,
            this.db,
            this.s3,
        )
            .then(async () => {
                return await this.upsertDocAck(changeRequest, AckStatus.Accepted);
            })
            .catch(async (err) => {
                return await this.upsertDocAck(changeRequest, AckStatus.Rejected, err.message);
            });
    }

    async upsertDocAck(
        changeRequest: ChangeReqDto,
        status: AckStatus,
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

        if (changeRequest.doc) {
            await this.db.getDoc(changeRequest.doc._id).then((res) => {
                if (res.docs.length > 0) {
                    ack.doc = res.docs[0];
                }
            });
        }

        return ack;
    }
}
