import { PostDocsDto } from "../dto/RestDocsDto";
import { HttpException, HttpStatus, Injectable, Inject } from "@nestjs/common";
import { DbQueryResult, DbService, GetDocsOptions } from "../db/db.service";
import { DocType, AclPermission } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { AccessMap } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { getJwtPermission, parsePermissionMap } from "../jwt/jwtPermissionMap";
import * as JWT from "jsonwebtoken";
import configuration, { Configuration } from "../configuration";

/**
 * Client configuration type definition
 */
type ClientConfig = {
    accessMap: AccessMap;
};

/**
 * Data response to client type definition
 */
// type ApiDataResponse = {
//     docs: Array<any>;
//     version?: number;
//     versionEnd?: number;
//     accessMap?: AccessMap;
// };

@Injectable()
export class DocsService {
    private readonly test: any = [];
    private cmsDocTypes: Array<DocType> = [DocType.Group, DocType.Change];
    private permissionMap: any;
    private config: Configuration;
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
    async processReq(req: PostDocsDto, token: string): Promise<DbQueryResult> {
        if (!this.apiVersionCheck(req.apiVersion))
            throw new HttpException(
                "API version is outdated, please update your app",
                HttpStatus.BAD_REQUEST,
            );

        const jwt: string | JWT.JwtPayload = JWT.verify(token, this.config.auth.jwtSecret);
        // Get group access
        this.permissionMap = parsePermissionMap(this.config.permissionMap, this.logger);
        const permissions = getJwtPermission(jwt, this.permissionMap, this.logger);

        // Get access map and send to client
        const clientConfig = {
            accessMap: PermissionSystem.getAccessMap(permissions.groups),
        } as ClientConfig;

        // Determine which doc types to get
        const docTypes = req.cms ? [...this.cmsDocTypes, ...this.appDocTypes] : this.appDocTypes;

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            clientConfig.accessMap,
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
        };
        if (from !== undefined) query.from = from;
        if (to !== undefined) query.to = to;

        // Get updated data from database
        // return await this.dbReq(permissions.userId, userViewGroups, from, to);

        let _res = undefined;
        await this.db
            .getDocsByGroup(query)
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

    /**
     * newDataReq event handler
     * @param req
     * @param userViewGroups
     * @param permissions
     */
    // async newDataReq(req: PostDocsDto, userViewGroups: any, permissions: any) {
    //     let from = 0;
    //     if (req.version && typeof req.version === "number") from = req.version;
    //     let to = await this.db.getLatestDocUpdatedTime();
    //     if (req.versionEnd && typeof req.versionEnd === "number") to = req.versionEnd;

    //     // Get updated data from database
    //     return await this.dbReq(permissions.userId, userViewGroups, from, to);
    // }

    // /**
    //  * oldDataReq event handler
    //  * @param req
    //  * @param userViewGroups
    //  * @param permissions
    //  */
    // async oldDataReq(req: PostDocsDto, userViewGroups: any, permissions: any) {
    //     let to = 0;
    //     if (req.version && typeof req.version === "number") to = req.version;

    //     // Get updated data from database
    //     return await this.dbReq(permissions.userId, userViewGroups, undefined, to);
    // }

    /**
     * backfillDataReq event handler
     * @param req
     * @param userViewGroups
     * @param permissions
     * @param docTypes
     */
    // async backfillDataReq(
    //     req: PostDocsDto,
    //     clientConfig: ClientConfig,
    //     permissions: any,
    //     docTypes: any,
    // ) {
    //     let res: ApiDataResponse = {
    //         docs: [],
    //     };

    //     let to = 0;
    //     if (req.version && typeof req.version === "number") to = req.version;

    //     // Get diff between user submitted access map and actual access
    //     const diff = PermissionSystem.accessMapDiff(clientConfig.accessMap, req.accessMap);
    //     const newAccessibleGroups = PermissionSystem.accessMapToGroups(
    //         diff,
    //         AclPermission.View,
    //         docTypes,
    //     );
    //     // Get historical data from database for newly accessible groups
    //     if (Object.keys(newAccessibleGroups).length > 0)
    //         res = await this.dbReq(permissions.userId, newAccessibleGroups, undefined, to);

    //     res.accessMap = clientConfig.accessMap;
    //     return res;
    // }

    /**
     * Query database for updated list of documents
     * @param userId
     * @param userViewGroups
     * @param from
     * @param to
     * @returns
     */
    // async dbReq(userId: string, userViewGroups: any, from?: number, to?: number) {
    //     let _res: ApiDataResponse = {
    //         docs: undefined,
    //         version: 0,
    //     };

    //     const query: GetDocsOptions = {
    //         userAccess: userViewGroups,
    //         type: DocType.Post,
    //         contentOnly: true,
    //     };
    //     if (from !== undefined) query.from = from;
    //     if (to !== undefined) query.to = to;
    //     // Get updated data from database
    //     await this.db
    //         .getDocsByGroup(query)
    //         .then((res: DbQueryResult) => {
    //             if (res.docs) {
    //                 _res = res;
    //             }
    //         })
    //         .catch((err) => {
    //             this.logger.error(`Error getting data for client: ${userId}`, err);
    //         });
    //     return _res;
    // }
}
