import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbQueryResult, DbService, SearchOptions } from "../db/db.service";
import { AclPermission, DocType } from "../enums";
import { AccessMap, PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { getJwtPermission, parsePermissionMap } from "../jwt/jwtPermissionMap";
import * as JWT from "jsonwebtoken";
import configuration, { Configuration } from "../configuration";
import { validateJWT } from "../validation/jwt";
import { SearchReqDto } from "../dto/SearchReqDto";

@Injectable()
export class SearchService {
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
    async processReq(query: SearchReqDto, token: string): Promise<DbQueryResult> {
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

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(accessMap, AclPermission.View, [
            ...query.types,
            DocType.Language,
        ]);

        if (query.includeDeleteCmds) {
            // Get accessible groups for delete command documents (all groups to which the user has view access to)
            const userAccessibleGroups = [...new Set(Object.values(userViewGroups).flat())];
            userViewGroups[DocType.DeleteCmd] = userAccessibleGroups;
        }

        if (Object.keys(userViewGroups).length < 1)
            throw new HttpException(
                "User does not have access to requested types",
                HttpStatus.FORBIDDEN,
            );

        const options: SearchOptions = {
            userAccess: userViewGroups,
            groups: query.groups,
            types: query.includeDeleteCmds ? [...query.types, DocType.DeleteCmd] : query.types,
            limit: query.limit,
            contentOnly: query.contentOnly,
            from: query.from,
            to: query.to,
            sort: query.sort,
            languages: query.languages,
            userId: query.userId,
            docId: query.docId,
        };

        let _res = undefined;
        await this.db
            .search(options)
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
}
