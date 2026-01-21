import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbQueryResult, DbService } from "../db/db.service";
import { AclPermission, DocType, PublishStatus, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { processJwt } from "../jwt/processJwt";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoComparisonCriteria, MongoSelectorDto } from "../dto/MongoSelectorDto";
import { LanguageDto } from "../dto/LanguageDto";
import { expandMangoSelector } from "../util/expandMangoQuery";

@Injectable()
export class QueryService {
    /** List of languages for content filtering */
    private languages: LanguageDto[] = [];

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
    ) {
        // Get list of languages from the database for content doc filtering by user accessible language.
        // This list is kept updated in memory to reduce database load
        this.db.on("languageUpdate", (doc) => {
            if (doc.type === DocType.Language) {
                // update or add language to the languages array
                const i = this.languages.findIndex((l) => l._id == doc._id);
                if (i >= 0) this.languages[i] = doc;
                else this.languages.push(doc);
            } else if (doc.type === DocType.DeleteCmd) {
                // remove language from the languages array
                const i = this.languages.findIndex((l) => l._id == doc._id);
                if (i >= 0) this.languages.splice(i, 1);
            }
        });

        this.db
            .executeFindQuery({
                selector: { type: DocType.Language },
                limit: Number.MAX_SAFE_INTEGER,
                use_index: "sync-language-index",
            })
            .then((res) => {
                this.languages.push(...(res.docs as LanguageDto[]));
            });
    }

    async query(query: MongoQueryDto, authToken: string): Promise<DbQueryResult> {
        const now = Date.now();

        // Expand the selector to ensure it is in the correct format, allowing injection of additional conditions like permission checks.
        query.selector = expandMangoSelector(query.selector);

        // Extract field values from the $and array
        const type = extractFieldFromAnd<string>(query.selector.$and, "type");
        const parentType = extractFieldFromAnd<string>(query.selector.$and, "parentType");
        const docType = extractFieldFromAnd<string>(query.selector.$and, "docType");

        // Extract details from query
        const memberOf = extractMemberOf(query.selector);
        removeMemberOf(query.selector);

        if (!type || typeof type !== "string")
            throw new HttpException("'type' field (string) is required in selector", HttpStatus.BAD_REQUEST);

        if (type === DocType.Content && !parentType)
            throw new HttpException(
                "'parentType' field is required for Content type",
                HttpStatus.BAD_REQUEST,
            );

        if (type === DocType.DeleteCmd && !docType)
            throw new HttpException(
                "'docType' field is required for DeleteCmd type",
                HttpStatus.BAD_REQUEST,
            );

        // Determine which doc types to check permissions against
        const permissionCheckTypes: DocType[] = [];
        switch (type as DocType) {
            case DocType.Content:
                permissionCheckTypes.push(parentType as DocType, DocType.Language);
                break;
            case DocType.DeleteCmd:
                docType == DocType.Content
                    ? // Include both Post and Tag doc types permission checks for content deletions
                      permissionCheckTypes.push(DocType.Post, DocType.Tag)
                    : permissionCheckTypes.push(docType as DocType);
                break;
            default:
                permissionCheckTypes.push(type as DocType);
        }

        // Get user accessible groups
        const userDetails = await processJwt(authToken, this.db, this.logger);

        // TODO: Get view permissions based CMS access if CMS view permissions are set (future)
        const userViewGroups = PermissionSystem.accessMapToGroups(
            userDetails.accessMap,
            AclPermission.View,
            [...permissionCheckTypes],
        );

        let viewGroups: string[];

        // Permission and publishing status filtering: Content documents
        if (type === DocType.Content) {
            viewGroups = userViewGroups[parentType as DocType] || [];
            const langViewGroups = userViewGroups[DocType.Language] || [];

            // Filter languages to those the user has view access to
            const accessibleLanguages = this.languages
                .filter((lang) => {
                    const langMemberOf = lang.memberOf as Uuid[];
                    return langMemberOf.some((g) => langViewGroups.includes(g));
                })
                .map((lang) => lang._id);

            // If no accessible languages, user cannot view any content
            if (accessibleLanguages.length === 0)
                throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

            // If the CMS flag is not set, add additional filters for published content
            if (!query.cms) {
                query.selector.$and.push(
                    {
                        $or: [{ expiryDate: { $exists: false } }, { expiryDate: { $gt: now } }],
                    },
                    { status: PublishStatus.Published },
                    { language: { $in: accessibleLanguages } },
                );
            }
        }

        // Permission filtering: DeleteCmd documents
        else if (type === DocType.DeleteCmd) {
            // For content document delete commands we strictly speaking need to check Post and Tag permissions using the
            // parentType field of the content document. This is however not available in the DeleteCmd documents.
            // As a compromise we combine all view groups for both Post and Tag document types. This may in some cases
            // distribute delete commands to users who would not normally have access to the content document,
            // but this will not have any negative effect as the delete command does not expose any sensitive information.
            if (docType === DocType.Content) {
                const s = new Set<string>();
                (userViewGroups[DocType.Post] || []).forEach((g: string) => s.add(g));
                (userViewGroups[DocType.Tag] || []).forEach((g: string) => s.add(g));
                viewGroups = [...s];
            } else {
                viewGroups = userViewGroups[docType as DocType] || [];
            }
        }

        // Permission filtering: all other document types
        else {
            viewGroups = userViewGroups[type as DocType] || [];
        }

        delete query.cms;

        // User has no access to any of the requested types/groups
        if (viewGroups.length === 0) throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

        // Add memberOf filter to the $and array
        query.selector.$and.push({
            memberOf: {
                $elemMatch: {
                    $in: memberOf.length
                        ? memberOf.filter((id) => viewGroups?.includes(id))
                        : viewGroups,
                },
            },
        });

        return this.db.executeFindQuery(query);
    }
}

/**
 * Extract memberOf groups from the top-level $and array.
 * (After expansion, memberOf will always be a condition in the $and array.
 */
function extractMemberOf(selector: MongoSelectorDto): Uuid[] {
    for (const condition of selector.$and || []) {
        const memberOf = (condition as MongoSelectorDto).memberOf;
        if (!memberOf) continue;

        if (typeof memberOf === "string") {
            return [memberOf];
        }

        if (Array.isArray((memberOf as MongoComparisonCriteria).$in)) {
            return (memberOf as MongoComparisonCriteria).$in as string[];
        }

        if (Array.isArray((memberOf as MongoComparisonCriteria).$elemMatch?.$in)) {
            return (memberOf as MongoComparisonCriteria).$elemMatch.$in as string[];
        }

        throw new HttpException("Invalid memberOf field in selector", HttpStatus.BAD_REQUEST);
    }

    return [];
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

/**
 * Extract a field value from the $and array.
 * Returns the first matching value found, or undefined if not present.
 * Throws if multiple different values are found for the same field.
 */
function extractFieldFromAnd<T>(andArray: MongoSelectorDto[], fieldName: string): T | undefined {
    let foundValue: T | undefined;

    for (const condition of andArray) {
        if (fieldName in condition) {
            const value = condition[fieldName] as T;

            // Only accept simple equality values (string, number, boolean)
            if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
                throw new HttpException(
                    `'${fieldName}' field must be a simple equality value`,
                    HttpStatus.BAD_REQUEST,
                );
            }

            if (foundValue !== undefined && foundValue !== value) {
                throw new HttpException(
                    `Multiple different '${fieldName}' values found in selector`,
                    HttpStatus.BAD_REQUEST,
                );
            }

            foundValue = value;
        }
    }

    return foundValue;
}
