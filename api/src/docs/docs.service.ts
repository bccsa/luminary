import { DocsReqDto } from "../dto/DocsReqDto";
import { HttpException, HttpStatus, Injectable, Inject } from "@nestjs/common";
import { DbQueryResult, DbService, GetDocsOptions } from "../db/db.service";
import { AclPermission } from "../enums";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { getJwtPermission, parsePermissionMap } from "../jwt/jwtPermissionMap";
import * as JWT from "jsonwebtoken";
import configuration, { Configuration } from "../configuration";

@Injectable()
export class DocsService {
    private readonly test: any = [];
    private permissionMap: any;
    private config: Configuration;

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
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
        if (!this.apiVersionCheck(req.apiVersion))
            throw new HttpException(
                "API version is outdated, please update your app",
                HttpStatus.BAD_REQUEST,
            );

        let jwt: string | JWT.JwtPayload;
        if (token) {
            try {
                jwt = JWT.verify(token, this.config.auth.jwtSecret);
            } catch (err) {
                this.logger.error(`Error verifying JWT`, err);
            }

            if (!jwt) {
                throw new HttpException(
                    "Invalid auth token, please re-login",
                    HttpStatus.BAD_REQUEST,
                );
            }
        }
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

        // check if user has access to requested docTypes
        if (!userViewGroups[req.type]) {
            throw new HttpException(
                "You do not have access to requested doc type",
                HttpStatus.FORBIDDEN,
            );
        }

        // validate if user has access to requested groups
        if (!userViewGroups[req.type].includes(req.group)) {
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

    // TODO: Implement API versioning
    /**
     * Check if client has a valid api version, block interaction if version is not the same
     * @param apiVersion - client api version
     * @returns
     */
    apiVersionCheck(apiVersion: string) {
        return apiVersion == apiVersion;
    }
}
