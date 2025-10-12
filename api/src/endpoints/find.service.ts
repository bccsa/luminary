import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbQueryResult, DbService } from "../db/db.service";
import { AclPermission, DocType, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { processJwt } from "../jwt/processJwt";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoComparisonCriteria, MongoSelectorDto } from "../dto/MongoSelectorDto";
import { _contentBaseDto } from "../dto/_contentBaseDto";
import { ContentDto } from "../dto/ContentDto";

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
        const memberOf = extractMemberOf(query.selector);
        const types = extractTypes(query.selector);
        let inMemoryPermissionCheck = false;
        if (types.length === 0) inMemoryPermissionCheck = true; // if no types specified, we need to do in-memory permission check after query

        const permissionCheckTypes = types.length === 0 ? Object.values(DocType) : [...types];
        if (permissionCheckTypes.includes(DocType.Content)) {
            // remove Content from types to check, since it requires special handling
            permissionCheckTypes.splice(permissionCheckTypes.indexOf(DocType.Content), 1);

            // Add Post and Tag types, since Content docs inherit permissions from their parents
            permissionCheckTypes.push(DocType.Post, DocType.Tag);
        }

        // Get user accessible groups
        const userViewGroups = PermissionSystem.accessMapToGroups(
            userDetails.accessMap,
            AclPermission.View,
            permissionCheckTypes,
        );

        // Remove 'type' and 'memberOf' fields from selector as we already extracted it, and re-add it as a top-level field to prevent unauthorized data access
        removeType(query.selector);
        removeMemberOf(query.selector);

        if (types.length) {
            const originalSelector = { ...query.selector };
            query.selector = { $or: [] };

            types.forEach((type) => {
                if (type === DocType.Content) {
                    // If the document is a Content type, we need to check the parentType for group access
                    // since Content documents do not have direct group membership

                    // To keep the query efficient and indexable (the structure needs to be identical in $or branches),
                    // we do a combined query for content documents by combining the memberOf filters
                    // for Post and Tag parentTypes, and rather do a more precise in-memory filtering after the query
                    // using the actual parentType field on the Content documents

                    inMemoryPermissionCheck = true;

                    const postTagViewGroups = [
                        ...(userViewGroups[DocType.Post] || []),
                        ...(userViewGroups[DocType.Tag] || []),
                    ].filter((v, i, a) => a.indexOf(v) === i); // unique

                    if (postTagViewGroups.length === 0) return; // user has no access to any posts or tags, so skip

                    query.selector.$or.push({
                        type: DocType.Content,
                        ...originalSelector,
                        memberOf: {
                            $in: memberOf.length
                                ? memberOf.filter((id) => postTagViewGroups.includes(id))
                                : postTagViewGroups,
                        },
                    });

                    return;
                } else {
                    if (!userViewGroups[type]?.length) return;

                    query.selector.$or.push({
                        type,
                        ...originalSelector,
                        memberOf: {
                            $in: memberOf.length
                                ? memberOf.filter((id) => userViewGroups[type]?.includes(id))
                                : userViewGroups[type],
                        },
                    });
                }
            });
        }

        return this.db.executeFindQuery(query).then((result) => {
            // If no types specified in selector or Content Documents are requested in the query,
            // we need to do in-memory permission check after the query
            if (inMemoryPermissionCheck) {
                result.docs = result.docs.filter((doc: _contentBaseDto) => {
                    // If the document is a Content type, we need to check the parentType for group access
                    // since Content documents do not have direct group membership
                    const docType =
                        doc.type === DocType.Content ? (doc as ContentDto).parentType : doc.type;

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
 * Extract memberOf groups from selector
 */
function extractMemberOf(selector: MongoSelectorDto): Uuid[] {
    let memberOf: Uuid[] = [];
    if (selector.memberOf) {
        if (typeof selector.memberOf === "string") {
            memberOf = [selector.memberOf];
        } else if (
            typeof selector.memberOf === "object" &&
            Array.isArray((selector.memberOf as MongoComparisonCriteria).$in)
        ) {
            memberOf = (selector.memberOf as MongoComparisonCriteria).$in as string[];
        } else {
            throw new HttpException("Invalid memberOf field in selector", HttpStatus.BAD_REQUEST);
        }
    }
    return memberOf;
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

/**
 * Recursively remove 'memberOf' fields from selector
 */
function removeMemberOf(selector: any): void {
    if (selector.memberOf) {
        delete selector.memberOf;
    }
    for (const key in selector) {
        if (key === "memberOf") delete selector[key];
        else if (key === "$or" || key === "$and") {
            if (Array.isArray(selector[key])) {
                for (const subSelector of selector[key]) {
                    removeMemberOf(subSelector);
                }
            }
        } else if (typeof selector[key] === "object" && selector[key] !== null) {
            removeMemberOf(selector[key]);
        }
    }
}
