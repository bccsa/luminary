import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbQueryResult, DbService, SearchOptions } from "../db/db.service";
import { AclPermission, DocType } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { processJwt } from "../jwt/processJwt";
import configuration, { Configuration } from "../configuration";
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
        const userDetails = await processJwt(token, this.db, this.logger);

        // Validate request
        if (!query.slug && (!query.types || query.types.length < 1)) {
            throw new HttpException(
                "Missing required parameters: slug or types",
                HttpStatus.BAD_REQUEST,
            );
        }

        if (query.slug) {
            const queryKeys = Object.keys(query);
            const invalidKeys = queryKeys.filter((key) => !["slug", "apiVersion"].includes(key));

            if (invalidKeys.length > 0) {
                throw new HttpException(
                    `Invalid parameters: A 'slug' search request is invalid when used together with ${invalidKeys.join(
                        ", ",
                    )}`,
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            userDetails.accessMap,
            AclPermission.View,
            [...query.types, DocType.Language],
        );

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
            docId: query.docId,
            slug: query.slug,
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
                this.logger.error(`Error getting data for client: ${userDetails.userId}`, err);
            });
        return _res;
    }
}
