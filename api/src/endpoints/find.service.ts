import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbQueryResult, DbService } from "../db/db.service";
import { AclPermission, DocType } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { processJwt } from "../jwt/processJwt";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoComparisonCriteria, MongoSelectorDto } from "../dto/MongoSelectorDto";
import { _contentBaseDto } from "../dto/_contentBaseDto";

@Injectable()
export class FindService {
    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
    ) {}

    async find(query: MongoQueryDto, authToken: string): Promise<DbQueryResult> {
        const userDetails = await processJwt(authToken, this.db, this.logger);

        // Extract details from query
        const types = extractTypes(query.selector);
        let inMemoryPermissionCheck = false;
        if (types.length === 0) inMemoryPermissionCheck = true; // if no types specified, we need to do in-memory permission check after query

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            userDetails.accessMap,
            AclPermission.View,
            types.length === 1 ? types : Object.values(DocType),
        );

        // Remove 'type' fields from selector as we already extracted it, and re-add it as a top-level field to prevent unauthorized data access
        removeType(query.selector);

        if (types.length) {
            const originalSelector = { ...query.selector };
            query.selector = { $or: [] };

            types.forEach((type) => {
                if (type === DocType.Content) {
                    // If the document is a Content type, we need to check the parentType for group access
                    // since Content documents do not have direct group membership

                    if (userViewGroups[DocType.Post]?.length) {
                        query.selector.$or.push({
                            type: DocType.Content,
                            parentType: DocType.Post,
                            ...originalSelector,
                            memberOf: { $in: userViewGroups[DocType.Post] },
                        });
                    }

                    if (userViewGroups[DocType.Tag]?.length) {
                        query.selector.$or.push({
                            type: DocType.Content,
                            parentType: DocType.Tag,
                            ...originalSelector,
                            memberOf: { $in: userViewGroups[DocType.Tag] },
                        });
                    }

                    return;
                } else {
                    if (!userViewGroups[type]?.length) return;

                    query.selector.$or.push({
                        type,
                        ...originalSelector,
                        memberOf: { $in: userViewGroups[type] },
                    });
                }
            });
        }

        return this.db.executeFindQuery(query).then((result) => {
            // If no types specified in selector, we need to do in-memory permission check after query
            if (inMemoryPermissionCheck) {
                result.docs = result.docs.filter((doc: _contentBaseDto) => {
                    let docType = doc.type;

                    // If the document is a Content type, we need to check the parentType for group access
                    // since Content documents do not have direct group membership
                    if (docType === DocType.Content) docType = (doc as any).parentType as DocType;

                    // If the document is a Group type, we check its own _id against userViewGroups
                    if (docType === DocType.Group) {
                        return userViewGroups[docType]?.includes(doc._id);
                    }

                    // For other types, we check memberOf against userViewGroups
                    return doc.memberOf?.some(
                        (groupId) => userViewGroups[docType]?.includes(groupId),
                    );
                });
            }
            return result;
        });
    }
}

/**
 * Extract document types from selector
 */
function extractTypes(selector: MongoSelectorDto): DocType[] {
    let types: DocType[] = [];
    if (selector.type) {
        if (typeof selector.type === "string") {
            types = [selector.type as DocType];
        } else if (
            typeof selector.type === "object" &&
            Array.isArray((selector.type as MongoComparisonCriteria).$in)
        ) {
            types = (selector.type as MongoComparisonCriteria).$in as DocType[];
        } else {
            throw new HttpException("Invalid type field in selector", HttpStatus.BAD_REQUEST);
        }
    }
    return types;
}

/**
 * Recursively remove 'type' fields from selector
 */
function removeType(selector: any): void {
    if (selector.type) {
        delete selector.type;
    }
    for (const key in selector) {
        if (key === "type") delete selector[key];
        else if (key === "$or" || key === "$and") {
            if (Array.isArray(selector[key])) {
                for (const subSelector of selector[key]) {
                    removeType(subSelector);
                }
            }
        } else if (typeof selector[key] === "object" && selector[key] !== null) {
            removeType(selector[key]);
        }
    }
}
