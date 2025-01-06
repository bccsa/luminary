import { DocsReqDto } from "../dto/DocsReqDto";
import { HttpException, HttpStatus, Injectable, Inject } from "@nestjs/common";
import { DbQueryResult, DbService, GetDocsOptions } from "../db/db.service";
import { DocType, AclPermission } from "../enums";
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
    private cmsDocTypes: Array<DocType> = [DocType.Group, DocType.Change];
    private appDocTypes: Array<DocType> = [
        DocType.Post,
        DocType.Tag,
        DocType.Content,
        DocType.Language,
        DocType.Redirect,
    ];

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
        const docTypes = req.cms ? [...this.cmsDocTypes, ...this.appDocTypes] : this.appDocTypes;

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            accessMap,
            AclPermission.View,
            docTypes,
        );

        let from = 0;
        if (req.gapEnd && typeof req.gapEnd === "number") from = req.gapEnd;
        let to = await this.db.getLatestDocUpdatedTime();
        if (req.gapStart && typeof req.gapStart === "number") to = req.gapStart;

        const query: GetDocsOptions = {
            userAccess: userViewGroups,
            type: req.type,
            contentOnly: req.contentOnly,
            accessMap: req.accessMap,
        };
        if (from !== undefined) query.from = from;
        if (to !== undefined) query.to = to;

        let _res = undefined;
        await this.db
            .getDocsPerType(query)
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
