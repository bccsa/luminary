import { PostDocsDto } from "../dto/RestDocsDto";
import { HttpException, HttpStatus, Injectable, Inject } from "@nestjs/common";
import { DbQueryResult, DbService } from "../db/db.service";
import { DocType, AclPermission } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { AccessMap } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";

/**
 * Client configuration type definition
 */
type ClientConfig = {
    accessMap: AccessMap;
};

/**
 * Data response to client type definition
 */
type ApiDataResponse = {
    docs: Array<any>;
    version?: number;
};

type docsPostResponse = {
    docs: any;
    version: number;
};

type dbQuery = {
    userAccess: any;
    from?: number;
    to?: number;
};

@Injectable()
export class DocsService {
    private readonly test: any = [];
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
    ) {}

    /**
     * Process api docs request
     * @param req - api request
     * @returns
     */
    async processReq(req: PostDocsDto): Promise<any> {
        if (!this.apiVersionCheck(req.apiVersion))
            throw new HttpException(
                "API version is outdated, please update your app",
                HttpStatus.BAD_REQUEST,
            );

        // Get access map and send to client
        const clientConfig = {
            accessMap: PermissionSystem.getAccessMap(req.memberOf),
        } as ClientConfig;

        // Determine which doc types to get
        const docTypes = req.reqData.cms
            ? [...this.cmsDocTypes, ...this.appDocTypes]
            : this.appDocTypes;

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            clientConfig.accessMap,
            AclPermission.View,
            docTypes,
        );

        if (req.newDataReq) return await this.newDataReq(req, userViewGroups);

        if (req.oldDataReq) return await this.oldDataReq(req, userViewGroups);

        if (req.backfillDataReq) return await this.backfillDataReq(req, clientConfig, docTypes);

        throw new HttpException(
            "One of the following fields is required to be true: newDataReq, oldDataReq, backfillDataReq",
            HttpStatus.BAD_REQUEST,
        );
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
     * @param reqData
     */
    async newDataReq(req: PostDocsDto, userViewGroups: any) {
        let from = 0;
        if (req.reqData.version && typeof req.reqData.version === "number")
            from = req.reqData.version;

        // Get updated data from database
        return await this.dbReq(req.userId, userViewGroups, from);
    }

    /**
     * oldDataReq event handler
     * @param req
     * @param reqData
     */
    async oldDataReq(req: PostDocsDto, userViewGroups: any) {
        console.log(userViewGroups);
        return req;
    }

    /**
     * backfillDataReq event handler
     * @param req
     * @param reqData
     */
    async backfillDataReq(req: PostDocsDto, clientConfig: ClientConfig, docTypes: any) {
        let res: ApiDataResponse = {
            docs: [],
        };

        let from = 0;
        if (req.reqData.version && typeof req.reqData.version === "number")
            from = req.reqData.version;

        // Get diff between user submitted access map and actual access
        const diff = PermissionSystem.accessMapDiff(clientConfig.accessMap, req.reqData.accessMap);
        const newAccessibleGroups = PermissionSystem.accessMapToGroups(
            diff,
            AclPermission.View,
            docTypes,
        );
        // Get historical data from database for newly accessible groups
        if (Object.keys(newAccessibleGroups).length > 0)
            res = await this.dbReq(req.userId, newAccessibleGroups, undefined, from);

        return res;
    }

    /**
     * Query database for updated list of documents
     * @param userId
     * @param userViewGroups
     * @param from
     * @param to
     * @returns
     */
    async dbReq(userId: string, userViewGroups: any, from?: number, to?: number) {
        const _res: docsPostResponse = {
            docs: undefined,
            version: 0,
        };

        const query: dbQuery = {
            userAccess: userViewGroups,
        };
        if (from) query.from = from;
        if (to) query.to = to;
        // Get updated data from database
        await this.db
            .getDocsPerGroup(userId, query)
            .then((res: DbQueryResult) => {
                if (res.docs) {
                    const response: ApiDataResponse = { docs: res.docs };
                    if (res.version) response.version = res.version;

                    _res.docs = response.docs;
                    _res.version = response.version;
                }
            })
            .catch((err) => {
                this.logger.error(`Error getting data for client: ${userId}`, err);
            });

        return _res;
    }
}
