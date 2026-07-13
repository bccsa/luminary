import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbQueryResult, DbService } from "../db/db.service";
import { AclPermission, DocType, PublishStatus, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { MongoQueryDto } from "../dto/MongoQueryDto";
import { MongoComparisonCriteria, MongoSelectorDto } from "../dto/MongoSelectorDto";
import { LanguageDto } from "../dto/LanguageDto";
import { expandMangoSelector } from "../util/expandMangoQuery";
import { isExpiredContent, stripExpiredContent } from "../util/stripExpiredContent";

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

        // Drop the language cache on disconnect; any changes made while the feed
        // was down would otherwise be missed by the resumed change stream.
        this.db.on("disconnect", () => {
            this.languages = [];
        });
        this.db.on("reconnect", () => {
            this.loadLanguages();
        });

        this.loadLanguages();
    }

    private loadLanguages() {
        this.db
            .executeFindQuery({
                selector: { type: DocType.Language },
                limit: Number.MAX_SAFE_INTEGER,
                use_index: "sync-language-index",
            })
            .then((res) => {
                // Merge by _id rather than reassigning or pushing blindly: the
                // `languageUpdate` change-stream listener may fire during the async
                // window of this query (especially on reconnect, where the resumed
                // feed can deliver events before this promise resolves). Reassigning
                // would clobber those concurrent updates; pushing could create
                // duplicates for docs the listener already inserted.
                for (const doc of res.docs as LanguageDto[]) {
                    const i = this.languages.findIndex((l) => l._id == doc._id);
                    if (i >= 0) this.languages[i] = doc;
                    else this.languages.push(doc);
                }
            })
            .catch((err) => {
                this.logger.error("Failed to load languages cache", err);
            });
    }

    async query(query: MongoQueryDto, userDetails: JwtUserDetails): Promise<DbQueryResult> {
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
            throw new HttpException(
                "'type' field (string) is required in selector",
                HttpStatus.BAD_REQUEST,
            );

        // Doc-type gate. `type`/`docType` are extracted post-expansion, so this catches
        // nested selectors, hybridQuery's unrestricted selector, AND the
        // BYPASS_TEMPLATE_VALIDATION escape hatch. Unknown types already fail closed
        // (empty viewGroups → Forbidden); this just returns a clearer error. Crypto docs
        // (encrypted S3 credentials) are strictly internal and never queryable.
        if (!(Object.values(DocType) as string[]).includes(type))
            throw new HttpException(
                `'${type}' is not a valid document type`,
                HttpStatus.BAD_REQUEST,
            );
        if (type === DocType.Crypto || docType === DocType.Crypto)
            throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

        if (type === DocType.DeleteCmd && !docType)
            throw new HttpException(
                "'docType' field is required for DeleteCmd type",
                HttpStatus.BAD_REQUEST,
            );

        // Determine which doc types to check permissions against
        const permissionCheckTypes: DocType[] = [];
        switch (type as DocType) {
            case DocType.Content:
                if (parentType) permissionCheckTypes.push(parentType as DocType, DocType.Language);
                else permissionCheckTypes.push(DocType.Post, DocType.Tag, DocType.Language);
                break;
            case DocType.DeleteCmd:
                if (docType === DocType.Content) {
                    permissionCheckTypes.push(DocType.Post, DocType.Tag);
                } else {
                    permissionCheckTypes.push(docType as DocType);
                }
                break;
            default:
                permissionCheckTypes.push(type as DocType);
        }

        // CMS-scoped requests (cms:true) are permission-gated by CmsView; app/public requests by
        // View. A CmsView ACL entry always also carries View (see validateAcl), so CMS users keep
        // their app-side published access too. When the caller holds no CmsView on any requested
        // group the resulting empty groups fall through to the same 403 guards as a missing View —
        // so requesting cms:true without CmsView is Forbidden, not a silent published-only result.
        const isCms = query.cms === true;
        const userViewGroups = PermissionSystem.accessMapToGroups(
            userDetails.accessMap,
            isCms ? AclPermission.CmsView : AclPermission.View,
            [...permissionCheckTypes],
        );

        let viewGroups: string[] = [];
        // True once a content query without parentType has injected its own per-parentType
        // memberOf scoping (the $or below), so the single global memberOf push is skipped.
        let memberOfInjected = false;

        // Permission and publishing status filtering: Content documents
        if (type === DocType.Content) {
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

            if (parentType) {
                viewGroups = userViewGroups[parentType as DocType] || [];
            } else {
                // No parentType in the query: scope EACH parentType to its own view groups via an
                // $or, so a Post-content doc can never be returned through Tag view access (or vice
                // versa). A flat Post+Tag group union would leak content across permission types.
                const postGroups = userViewGroups[DocType.Post] || [];
                const tagGroups = userViewGroups[DocType.Tag] || [];
                const postEff = memberOf.length
                    ? postGroups.filter((g) => memberOf.includes(g))
                    : postGroups;
                const tagEff = memberOf.length
                    ? tagGroups.filter((g) => memberOf.includes(g))
                    : tagGroups;

                const branches: MongoSelectorDto[] = [];
                if (postEff.length)
                    branches.push({
                        $and: [
                            { parentType: DocType.Post },
                            { memberOf: { $elemMatch: { $in: postEff } } },
                        ],
                    });
                if (tagEff.length)
                    branches.push({
                        $and: [
                            { parentType: DocType.Tag },
                            { memberOf: { $elemMatch: { $in: tagEff } } },
                        ],
                    });

                if (branches.length === 0)
                    throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

                query.selector.$and.push({ $or: branches });
                memberOfInjected = true;
            }

            // If the CMS flag is not set, add additional filters for published content
            if (!query.cms) {
                // For update syncs (includeExpired=true), omit the expiry filter so offline clients
                // receive the updated doc when an expiry date is changed on a published document.
                // For full/initial syncs, expired docs are excluded as normal.
                if (!query.includeExpired) {
                    query.selector.$and.push({
                        $or: [{ expiryDate: { $exists: false } }, { expiryDate: { $gt: now } }],
                    });
                }
                query.selector.$and.push(
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
        delete query.includeExpired;

        // For content queries without parentType the per-parentType $or above already injected
        // memberOf scoping; otherwise apply the single global memberOf filter here.
        if (!memberOfInjected) {
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
        }

        // `use_index` (when present) is forwarded to CouchDB as-is. The query
        // validator allowlists the permitted names against the design-doc registry;
        // index selection is a client-side concern (see shared/src/util/hybridQuery —
        // same pattern as sync/syncBatch.ts).
        //
        // Request execution stats so the controller can classify scans (the cost is
        // only knowable post-hoc). Set here, not in executeFindQuery, so the auth /
        // languages / search callers of that method are unaffected.
        (query as any).execution_stats = true;
        const result = await this.executeQuery(query, type as DocType);

        // Data minimization (covers both sync and HybridQuery — both POST /query): a non-CMS
        // response can only contain an expired Content doc via the app's includeExpired update-sync,
        // returned purely so the client can prune its stale copy — never to display. Strip the body
        // so it never crosses the wire. CMS (cms:true / CmsView-validated) responses keep full docs.
        // See util/stripExpiredContent.ts; the Socket.io base-room emit applies the same projection.
        if (!isCms && Array.isArray(result?.docs)) {
            result.docs = result.docs.map((doc: any) =>
                isExpiredContent(doc, now) ? stripExpiredContent(doc) : doc,
            );
        }
        return result;
    }

    /**
     * A publishDate-led index must scan the Content partition before applying parentId,
     * and no index can serve `parentId: { $in: [...] }` with a global publishDate sort.
     * Fan out to per-parent index seeks and merge their results instead.
     */
    private async executeQuery(query: MongoQueryDto, type: DocType): Promise<DbQueryResult> {
        if (type !== DocType.Content) return this.db.executeFindQuery(query);

        const parentIdCriteria = findParentIdIn(query.selector.$and || []);
        if (!parentIdCriteria) return this.db.executeFindQuery(query);

        const rawIds = parentIdCriteria.$in;
        if (!Array.isArray(rawIds)) return this.db.executeFindQuery(query);
        if (rawIds.some((id) => typeof id !== "string")) {
            throw new HttpException(
                "'parentId.$in' values must be strings",
                HttpStatus.BAD_REQUEST,
            );
        }

        const parentIds = [...new Set(rawIds as string[])];
        if (parentIds.length === 0) return { docs: [], blockStart: 0, blockEnd: 0 };

        // ponytail: unbounded fan-out; add a concurrency cap if a parent set ever gets large
        const results = await Promise.all(
            parentIds.map((id) =>
                this.db.executeFindQuery({
                    ...query,
                    selector: {
                        $and: (query.selector.$and || []).map((condition) =>
                            condition.parentId === parentIdCriteria ? { parentId: id } : condition,
                        ),
                    },
                    use_index: "content-parentId-publishDate-index",
                }),
            ),
        );

        const seen = new Set<string>();
        const docs = applySortAndLimit(
            results
                .flatMap((result) => result.docs || [])
                .filter((doc) => !seen.has(doc._id) && (seen.add(doc._id), true)),
            query.sort,
            query.limit,
        );
        const result: DbQueryResult = {
            docs,
            execution_stats: {
                total_keys_examined: results.reduce(
                    (total, item) => total + (item.execution_stats?.total_keys_examined ?? 0),
                    0,
                ),
                total_docs_examined: results.reduce(
                    (total, item) => total + (item.execution_stats?.total_docs_examined ?? 0),
                    0,
                ),
                execution_time_ms: results.reduce(
                    (total, item) => total + (item.execution_stats?.execution_time_ms ?? 0),
                    0,
                ),
                results_returned: docs.length,
            },
        };
        setBlockRange(result);
        return result;
    }
}

function findParentIdIn(and: MongoSelectorDto[]): MongoComparisonCriteria | undefined {
    for (const condition of and) {
        const value = condition.parentId;
        if (value && typeof value === "object" && !Array.isArray(value) && "$in" in value) {
            return value as MongoComparisonCriteria;
        }
    }
    return undefined;
}

function applySortAndLimit(
    docs: any[],
    sort: MongoQueryDto["sort"],
    limit: number | undefined,
): any[] {
    let result = docs;
    if (sort?.length) {
        const [field, direction] = Object.entries(sort[0] || {})[0] || [];
        if (field) {
            const desc = direction === "desc";
            result = docs.slice().sort((a, b) => {
                const av = a?.[field];
                const bv = b?.[field];
                let cmp = 0;
                if (av == null && bv != null) cmp = -1;
                else if (av != null && bv == null) cmp = 1;
                else if (av < bv) cmp = -1;
                else if (av > bv) cmp = 1;
                if (desc) cmp = -cmp;
                if (cmp !== 0) return cmp;
                return String(a?._id ?? "").localeCompare(String(b?._id ?? ""));
            });
        }
    }
    return typeof limit === "number" ? result.slice(0, Math.max(0, limit)) : result;
}

function setBlockRange(result: DbQueryResult): void {
    const times = result.docs
        .map((doc) => doc?.updatedTimeUtc)
        .filter((value): value is number => typeof value === "number");
    result.blockStart = times.length ? Math.max(...times) : 0;
    result.blockEnd = times.length ? Math.min(...times) : 0;
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
 * Remove memberOf from conditions in the top-level $and array.
 * (After expansion, memberOf will always be a condition in the $and array.)
 */
function removeMemberOf(selector: MongoSelectorDto): void {
    if (!selector.$and) return;

    for (const condition of selector.$and) {
        if ((condition as any).memberOf !== undefined) {
            delete (condition as any).memberOf;
        }
    }

    // Remove any conditions that are now empty after memberOf deletion
    selector.$and = selector.$and.filter((condition) => Object.keys(condition).length > 0);
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
            if (
                typeof value !== "string" &&
                typeof value !== "number" &&
                typeof value !== "boolean"
            ) {
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
