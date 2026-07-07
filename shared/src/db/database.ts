import Dexie, { Collection, IndexableType, type Table } from "dexie";
import {
    AckStatus,
    AclPermission,
    BaseDocumentDto,
    ChangeReqAckDto,
    ContentDto,
    DeleteCmdDto,
    DeleteReason,
    DocType,
    LocalChangeDto,
    PublishStatus,
    TagDto,
    TagType,
    Uuid,
} from "../types";
import { scheduleCorpusStatsRecompute } from "../fts/ftsIndexer";
import { toRaw, watch } from "vue";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { filterAsync, someAsync } from "../util/asyncArray";
import { watchValue } from "../util/watchValue";
import { accessMap, getAccessibleGroups, verifyAccess } from "../permissions/permissions";
import { config } from "../config";
import { changeReqErrors, changeReqInfo, changeReqWarnings } from "../config";
import { cloneDeep } from "lodash-es";

const dbName: string = "luminary-db";

type LuminaryInternals = {
    id: string;
    value: any;
};

/**
 * A row in the `retention` side table: the keep-alive deadline for a below-cutoff
 * Content doc. Stored separately from `docs` so stamping never rewrites a document
 * (no liveQuery self-churn / corpus recompute) and a sync/socket doc-rewrite can't
 * clobber the stamp. See `db/retention.ts`.
 */
export type RetentionEntry = {
    docId: string;
    retainUntil: number;
};

type dbIndex = {
    docs: string;
    localChanges: string;
    luminaryInternals: string;
    retention: string;
};

export type QueryOptions = {
    filterOptions?: {
        /**
         * Only return top level tags (i.e. tags that are not tagged with other tags of the same tag type).
         * Not applicable to post queries
         */
        topLevelOnly?: boolean;
        /**
         * Only return pinned or unpinned tags
         * Not applicable to post queries
         */
        pinned?: boolean;
        /**
         * Limit the results to the specified number
         */
        limit?: number;
        /**
         * Only return documents of the specified DocType.
         * When used with tagsWhereTagType(), this option is used when calculating the newest content publish date per tag.
         */
        docType?: DocType.Post | DocType.Tag;
    };
    /**
     * Sort options are only applicable to Post and Tag queries.
     */
    sortOptions?: {
        /**
         * Sort by publishDate.
         */
        sortBy?: "publishDate" | "title";
        /**
         * Sort in ascending or descending order.
         */
        sortOrder?: "asc" | "desc";
    };
    /**
     * Optionally set the language ID
     */
    languageId?: Uuid;
};

/**
 * Upsert Options
 */
export type UpsertOptions<T> = {
    /**
     * The document to upsert
     */
    doc: T;
    /**
     * If true, the entry in the local changes table will be overwritten with the new change
     */
    overwriteLocalChanges?: boolean;
    /**
     * Only update the local changes database (used for sending changes to the API), and do not update the docs table
     */
    localChangesOnly?: boolean;
};

class Database extends Dexie {
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<Partial<LocalChangeDto>>; // Partial because it includes id which is only set after saving
    luminaryInternals!: Table<LuminaryInternals>;
    retention!: Table<RetentionEntry>;

    // In-memory (not persisted) resolvers for callers awaiting the real server ack of a
    // queued local change — see `upsert`'s `localChangeId` and `waitForLocalChangeAck`.
    private localChangeAckWaiters = new Map<number, (ack: ChangeReqAckDto) => void>();

    /**
     * Luminary Shared Database class
     * @param dbVersion - Current Dexie DB version
     * @param docsIndex - App specific Index
     */
    constructor(dbVersion: number, docsIndex: string) {
        super(dbName);
        this.requestIndexDbPersistent();

        const index: string = concatIndex(
            "_id,type,parentType,language,expiryDate,parentId,publishDate,[type+tagType],*fts",
            docsIndex,
        ); // Concatenate and compact app specific indexed fields with shared library indexed fields
        const dbIndex: dbIndex = {
            docs: index,
            localChanges: "++id, reqId, docId, status",
            luminaryInternals: "id",
            retention: "docId, retainUntil",
        };

        const version: number = bumpDBVersion(
            (dbVersion >= 10 && dbVersion / 10) || 1,
            localStorage.getItem("dexie.dbIndex") || "{}",
            dbIndex,
        );

        this.version(version).stores(dbIndex);
    }

    /**
     * Request persistent storage for the database (to be called on load)
     */
    async requestIndexDbPersistent() {
        const isPersistent =
            navigator?.storage?.persisted && (await navigator?.storage?.persisted());

        if (!isPersistent) {
            navigator?.storage?.persist().then((granted) => {
                if (granted) {
                    console.log("Permission to change storage persistence was granted");
                } else {
                    console.log("Permission to change storage persistence was denied");
                }
            });
        }
    }

    /**
     * Generate a UUID
     */
    uuid() {
        return uuidv4();
    }

    async getSyncList() {
        const _v = await this.getLuminaryInternals("syncList");
        if (_v && Array.isArray(_v)) {
            const { syncList } = await import("../api/sync/state");
            syncList.value = _v;
        }
        return _v;
    }

    async setSyncList() {
        const { syncList } = await import("../api/sync/state");
        return await this.setLuminaryInternals("syncList", cloneDeep(syncList.value));
    }

    async setLuminaryInternals(key: string, value: any) {
        return await this.luminaryInternals.put({ id: key, value: value }, key);
    }

    getLuminaryInternals(key: string): Promise<any> {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve) => {
            const _v: LuminaryInternals = (await this.luminaryInternals.get(
                key,
            )) as LuminaryInternals;
            resolve(_v && _v.value);
        });
    }

    /**
     * Get an IndexedDB document by its id
     */
    get<T extends BaseDocumentDto>(id: Uuid) {
        return this.docs.get(id) as unknown as Promise<T>;
    }

    /**
     * Bulk insert documents into the database, and delete documents that are marked for deletion.
     */
    async bulkPut(docs: BaseDocumentDto[]) {
        const candidateDeleteCmds = docs.filter(
            (doc) =>
                doc.type === DocType.DeleteCmd && this.validateDeleteCommand(doc as DeleteCmdDto),
        ) as DeleteCmdDto[];

        // Bulk-fetch target docs once, then skip any deleteCmd whose target is already
        // at-or-newer than the deleteCmd itself (e.g. unpublish-then-republish race).
        const targetIds = candidateDeleteCmds.map((cmd) => cmd.docId);
        const existing = targetIds.length > 0 ? await this.docs.bulkGet(targetIds) : [];
        const existingById = new Map<string, BaseDocumentDto>();
        for (const d of existing) {
            if (d) existingById.set(d._id, d);
        }

        const toDeleteIds = candidateDeleteCmds
            .filter((cmd) => {
                const local = existingById.get(cmd.docId);
                if (!local) return true;
                return local.updatedTimeUtc < cmd.updatedTimeUtc;
            })
            .map((cmd) => cmd.docId);

        if (toDeleteIds.length > 0) {
            await this.docs.bulkDelete(toDeleteIds);
        }

        const nonDeleteDocs = docs.filter((doc) => doc.type !== DocType.DeleteCmd);

        // Content is the only doctype whose `fts` index is used locally (offline trigram search
        // via the `*fts` MultiEntry index). Other doctypes (e.g. User/Redirect) may carry a
        // server-only `fts` used only by the `/fts` endpoint; strip it before persisting so it
        // can't pollute the offline Content index (stray matches + df/IDF skew) or bloat Dexie.
        const cleanedDocs = nonDeleteDocs.map((doc) => {
            if (doc.type === DocType.Content) return doc;
            const d = doc as Record<string, any>;
            if (d.fts === undefined && d.ftsTokenCount === undefined) return doc;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { fts, ftsTokenCount, ...rest } = d;
            return rest as BaseDocumentDto;
        });
        const result = await this.docs.bulkPut(cleanedDocs);

        // Update corpus stats if this batch contained ContentDtos
        if (nonDeleteDocs.length > 0 && nonDeleteDocs[0].type === DocType.Content) {
            scheduleCorpusStatsRecompute();
        }

        return result;
    }

    /**
     * Return true if there are some documents of the specified DocType
     */
    async someByType(docType: DocType) {
        return (await this.docs.where("type").equals(docType).first()) != undefined;
    }

    /**
     * Get IndexedDB documents by their parentId(s)
     * @param parentId - The parentId(s) to filter by
     * @param parentType - Optional: The parent type to filter by
     */
    whereParent(
        parentId: Uuid | Uuid[],
        parentType?: DocType.Post | DocType.Tag,
        languageId?: Uuid,
    ) {
        let res;
        if (Array.isArray(parentId)) {
            res = this.docs.where("parentId").anyOf(parentId);
        } else {
            res = this.docs.where({ parentId });
        }

        if (parentType) res = res.and((d) => d.parentType == parentType);

        if (languageId) res = res.and((d) => d.language == languageId);

        return res.toArray() as unknown as Promise<ContentDto[]>;
    }

    /**
     * Check if a tag document is of a certain tag type
     */
    async isTagType(id: Uuid, tagType: TagType) {
        const doc = await this.get<TagDto>(id);
        if (!doc) return false;
        return doc.type === DocType.Tag && doc.tagType === tagType;
    }

    /**
     * Get all tags of a certain tag type
     */
    async tagsWhereTagType(tagType: TagType, options?: QueryOptions): Promise<TagDto[]> {
        if (!options?.languageId) {
            console.error("Language ID is required");
            return [];
        }
        if (options.sortOptions) {
            console.error("Sort options are not applicable to tag type queries");
            return [];
        }

        // Get all tags of the specified tag type
        const res = (await this.docs
            .where({ type: DocType.Tag, tagType })

            // Optionally only include pinned or unpinned tags
            .and((t) => {
                if (options?.filterOptions?.pinned === true) return t.pinned === 1;
                if (options?.filterOptions?.pinned === false) return t.pinned === 0;
                return true;
            })
            .toArray()) as TagDto[];

        // Filter array in memory
        let filtered = res;
        const now = Date.now();
        filtered = await filterAsync(res, async (tag: TagDto) => {
            // Get the content document of the tag for the selected language
            const tagContent = await this.whereParent(tag._id, DocType.Tag, options.languageId);

            // Check if the tag has content in the selected language
            if (tagContent.length == 0) return false;

            // Exclude results which are not publised
            if (tagContent[0].status == PublishStatus.Draft) return false;

            // Exlcude results where the publish date is in the future
            if (!tagContent[0].publishDate || tagContent[0].publishDate > now) return false;

            // Exclude results where the expiry date is in the past
            if (tagContent[0].expiryDate && tagContent[0].expiryDate < now) return false;

            // Optionally only include tags that are not tagged with other tags of the same tag type
            if (options?.filterOptions?.topLevelOnly) {
                return !(await someAsync(tag.tags, async (tagId) =>
                    this.isTagType(tagId, tagType),
                ));
            }

            return true;
        });

        // Get the newest content publish date per tag
        const newestContent: { tagId: Uuid; publishDate: number }[] = [];
        const pList = [];
        for (const tag of filtered) {
            pList.push(
                this.contentWhereTag(tag._id, {
                    languageId: options.languageId,
                    filterOptions: { limit: 1, docType: options.filterOptions?.docType },
                    sortOptions: { sortBy: "publishDate", sortOrder: "desc" },
                }).then((content) => {
                    if (content.length > 0) {
                        newestContent.push({
                            tagId: tag._id,
                            publishDate: content[0].publishDate!,
                        });
                    }
                }),
            );
        }
        await Promise.all(pList);

        // Filter out tags that are not used
        const usedTags = filtered.filter((tag) => newestContent.some((c) => c.tagId == tag._id));

        // Sort the decending tags by the newest content publish date
        const sorted = usedTags.sort((a, b) => {
            const aDate = newestContent.find((c) => c.tagId == a._id)?.publishDate || 0;
            const bDate = newestContent.find((c) => c.tagId == b._id)?.publishDate || 0;
            return bDate - aDate;
        });

        // Optionally limit the number of results.
        if (options?.filterOptions?.limit) {
            return sorted.slice(0, options.filterOptions.limit);
        }

        return sorted;
    }

    /**
     * Get all content documents that are tagged with the passed tag ID. If no tagId is passed, return all posts and tags.
     */
    async contentWhereTag(tagId?: Uuid, options?: QueryOptions) {
        if (options?.filterOptions?.topLevelOnly) {
            console.error("Top level only filter is not applicable to content queries");
            return [];
        }
        if (!options?.languageId) {
            console.error("Language ID is required");
            return [];
        }
        if (!tagId && !options.filterOptions?.limit) {
            console.error("Limit is required if no tagId is passed");
            return [];
        }

        let res;
        if (options.filterOptions?.limit) {
            res = this.docs.orderBy("publishDate");
        } else {
            res = this.docs.where("type").equals(DocType.Content);
        }

        res.and((d) => {
            const doc = d as ContentDto;
            // Check type
            if (doc.type != DocType.Content) return false;

            // Optionally filter by parent DocType
            if (options.filterOptions?.docType && doc.parentType != options.filterOptions.docType) {
                return false;
            }

            // Filter by language
            if (doc.language != options.languageId) return false;

            // Filter by status
            if (doc.status != "published") return false;

            // Filter by publish date
            if (doc.publishDate == undefined || doc.publishDate > Date.now()) return false;

            // Filter by expiry date
            if (doc.expiryDate != undefined && doc.expiryDate < Date.now()) return false;

            // Optionally filter by tagId
            if (!doc.parentTags || (tagId && !doc.parentTags.some((tag) => tag == tagId)))
                return false;

            return true;
        });

        // Optionally limit the number of results
        if (options.filterOptions?.limit) res = res.limit(options.filterOptions.limit);

        // Optionally sort the results (in memory sorting)
        if (options.sortOptions?.sortBy) {
            let sorted = res;
            if (options.sortOptions.sortOrder == "desc") sorted = res.reverse();

            return (await sorted.sortBy(options.sortOptions.sortBy)) as unknown as Promise<
                ContentDto[]
            >;
        }

        return (await res.toArray()) as unknown as Promise<ContentDto[]>;
    }

    /**
     * Update or insert a document into the database and queue the change to be sent to the API. If the deleteReq flag is set, the document will be deleted from the local database and the document with deleteReq flag will be queued to be sent to the API.
     * @param options {UpsertOptions} - The options to upsert a document
     * @returns the queued `localChanges` entry's id — pass it to {@link waitForLocalChangeAck} to await the real server ack instead of assuming success.
     */
    async upsert<T extends BaseDocumentDto>(
        options: UpsertOptions<T>,
    ): Promise<{ localChangeId: number }> {
        // Unwrap the (possibly) reactive object — toRaw is shallow, so cloneDeep is required
        // to strip nested reactive Proxies before IndexedDB's structured clone algorithm runs.
        const raw = cloneDeep(toRaw(options.doc));

        if (!options.localChangesOnly) {
            if (options.doc.deleteReq) {
                // Delete the document from the local database. The document will be deleted from the API when the change is sent from the localChanges table
                await this.docs.delete(raw._id);
                options.overwriteLocalChanges = true;

                // If the document is a post or tag, delete all the associated content documents
                // Note: We do not need to send delete requests to the API, as the API will delete the content documents when the parent document is deleted
                if (raw.type == DocType.Post || raw.type == DocType.Tag) {
                    await this.docs.where("parentId").equals(raw._id).delete();
                }
            } else {
                await this.docs.put(raw, raw._id);
            }
        }

        if (options.overwriteLocalChanges) {
            // Delete the previous change from the localChanges table (if any). It will never
            // get a real server ack now (superseded by the new queued change below), so resolve
            // any caller awaiting THAT entry's ack via waitForLocalChangeAck first — otherwise
            // it would hang forever.
            const superseded = await this.localChanges.where({ docId: raw._id }).toArray();
            await this.localChanges.where({ docId: raw._id }).delete();
            for (const change of superseded) {
                if (change.id == null) continue;
                const resolve = this.localChangeAckWaiters.get(change.id);
                if (resolve) {
                    this.localChangeAckWaiters.delete(change.id);
                    resolve({
                        ack: AckStatus.Accepted,
                        message: "Superseded by a newer local change",
                    });
                }
            }
        }

        // Queue the change to be sent to the API
        const localChangeId = await this.localChanges.put({
            doc: raw,
            docId: raw._id,
        });
        return { localChangeId };
    }

    /**
     * Resolve once the real outcome of a queued local change (identified by the
     * `localChangeId` `upsert` returned) is known: either the actual server ack, via
     * {@link applyLocalChangeAck} once connectivity allows it to upload, or a synthetic
     * `Accepted` if a later edit to the same doc supersedes it first (see `upsert`'s
     * `overwriteLocalChanges` handling). Stays pending indefinitely while offline — the
     * change is durably queued and will resolve once the app reconnects.
     */
    waitForLocalChangeAck(localChangeId: number): Promise<ChangeReqAckDto> {
        return new Promise((resolve) => {
            this.localChangeAckWaiters.set(localChangeId, resolve);
        });
    }

    /**
     * Convert a numeric (UNIX) date to a DateTime object
     */
    toDateTime(date: number) {
        return DateTime.fromMillis(date).setLocale(navigator.language || "en-US");
    }

    /**
     * Convert a numeric (UNIX) date to an ISO date string
     * @param date
     * @returns
     */
    toIsoDateTime(date: number) {
        return DateTime.fromMillis(date)
            .setLocale(navigator.language || "en-US")
            .toISO({
                includeOffset: false,
                suppressSeconds: true,
            });
    }

    /**
     * Convert a DateTime object to a numeric (UNIX) date
     */
    fromDateTime(date: DateTime) {
        return date.setLocale(navigator.language || "en-US").toMillis();
    }

    /**
     * Convert an ISO date string to a numeric (UNIX) date
     * @param date
     * @returns
     */
    fromIsoDateTime(date: string) {
        return DateTime.fromISO(date)
            .setLocale(navigator.language || "en-US")
            .toMillis();
    }

    /**
     * Get all local changes
     */
    getLocalChanges() {
        return this.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>;
    }

    /**
     * Apply a change request ack from the API
     * @param ack The acknowledgement from the API
     * @param localChange The local change that was sent (used to identify which entry to delete)
     */
    async applyLocalChangeAck(ack: ChangeReqAckDto, localChange: LocalChangeDto) {
        if (ack.ack == "rejected") {
            // CouchDB's own tombstone reason for a write against an already-deleted doc —
            // i.e. another client deleted this doc before our change synced. The cleanup
            // below (deleting the local copy) already reconciles state correctly, so this
            // isn't an actionable error for the user.
            if (ack.message !== "deleted") {
                changeReqErrors.value.push(ack.message || "Unknown error occured");
            }
            if (ack.docs && Array.isArray(ack.docs)) {
                // Replace our local copy(s) with the provided database version
                await this.docs.bulkPut(ack.docs);
            } else {
                // Otherwise attempt to delete the item, as it might have been a rejected create action
                await this.docs.delete(localChange.doc._id);
            }
        }

        if (ack.ack == "accepted" && ack.warnings && ack.warnings.length > 0) {
            changeReqWarnings.value = ack.warnings;
        }

        if (ack.ack == "accepted" && ack.info && ack.info.length > 0) {
            changeReqInfo.value = ack.info;
        }

        await this.localChanges.delete(localChange.id);

        const resolve = this.localChangeAckWaiters.get(localChange.id);
        if (resolve) {
            this.localChangeAckWaiters.delete(localChange.id);
            resolve(ack);
        }
    }

    /**
     * Return a list of documents and change documents of specified DocType that are NOT members of the given groupIds as a Dexie collection
     */
    private whereNotMemberOfAsCollection(
        groupIds: Array<Uuid>,
        docType: DocType,
        // changeDocs = false,
    ) {
        // Query groups and group changeDocs
        if (docType === DocType.Group) {
            return this.docs.where({ type: docType }).filter((group) => {
                // Check if the ACL field exists
                if (!group.acl) return false;

                // The AclMap already indicates if the user has view access to the group, so we only need to check that the group document is not listed in the AclMap
                return !groupIds.includes(group._id);
            });
        }

        // Query other documents
        let query: Collection<BaseDocumentDto, IndexableType>;

        if (docType == DocType.Post || docType == DocType.Tag) {
            query = this.docs.where("type").equals(docType).or("parentType").equals(docType);
        } else {
            query = this.docs.where("type").equals(docType);
        }

        return query.filter((doc) => {
            // Check if the memberOf field exists
            if (!doc.memberOf) return false;

            // Check if the document is NOT a member of the given groupIds
            return !doc.memberOf.some((groupId) => groupIds.includes(groupId));
        });
    }

    /**
     * Delete documents to which access has been revoked
     * @param options - changeDocs: If true, deletes change documents instead of regular documents
     */
    deleteRevoked() {
        // CMS visibility is gated by CmsView, the app's by View (GitHub #160). Choose explicitly
        // from the consumer mode — no hidden substitution.
        const groupsPerDocType = getAccessibleGroups(
            config.cms ? AclPermission.CmsView : AclPermission.View,
        );

        Object.values(DocType)
            .filter((t) => t !== DocType.Content) // Exclude content documents as they are deleted together with their parent's document type
            .forEach(async (docType) => {
                let groups = groupsPerDocType[docType as DocType];
                if (groups === undefined) groups = [];

                const revokedDocs = this.whereNotMemberOfAsCollection(groups, docType as DocType);

                // Delete associated Language content documents
                if (docType === DocType.Language) {
                    const revokedLanguages = await revokedDocs.toArray();
                    const revokedlanguageIds = revokedLanguages.map((l) => l._id);
                    await this.docs.where("language").anyOf(revokedlanguageIds).delete();
                }

                const revokedIds = (await revokedDocs.primaryKeys()) as string[];

                if (revokedIds.length > 0) {
                    await this.whereNotMemberOfAsCollection(groups, docType as DocType).delete();
                }
            });

        // Keep `syncList` consistent with the docs just evicted. A column must never claim coverage
        // of a group the user can no longer access: an `eof` column left standing after its docs are
        // gone suppresses the re-walk on a later re-grant (the memberOf is unchanged, so the
        // new-groups growth path never triggers), leaving only the ~1000ms head-tolerance re-fetch —
        // the "one post / one tag" partial-sync bug (#160). This is the symmetric half of the doc
        // eviction above and generalises the one-time Group-only `resetGroupSyncListForRecovery`.
        this.reconcileSyncListToAccess(groupsPerDocType);

        scheduleCorpusStatsRecompute();
    }

    /**
     * Trim every `syncList` column to the groups the user can still access, dropping columns whose
     * groups were all revoked. Mirrors {@link deleteRevoked}'s doc eviction so the sync cursor and
     * the stored docs stay in lockstep. A column's permission doc type is `subType ?? type`: Content
     * (`content:post`) and DeleteCmd (`deleteCmd:post`) inherit their parent Post/Tag groups, exactly
     * as the eviction does via the `parentType` match.
     *
     * Delegates the per-column work to the canonical {@link trim} primitive (the documented
     * "user left groups" path), once per distinct chunkType, passing only `memberOf` so language and
     * publishDate coverage is left intact. After a partial revoke a column shrinks to its surviving
     * groups; a later re-grant of the dropped group then arrives as a genuine memberOf growth (a
     * fresh column walked to depth, then merged) — the incremental path, not a reset.
     */
    private async reconcileSyncListToAccess(groupsPerDocType: Record<DocType, Uuid[]>) {
        const [{ syncList }, { trim }, { splitChunkTypeString }] = await Promise.all([
            import("../api/sync/state"),
            import("../api/sync/trim"),
            import("../api/sync/utils"),
        ]);

        // Snapshot the distinct chunkTypes before trim() mutates the list in place.
        const chunkTypes = Array.from(new Set(syncList.value.map((e) => e.chunkType)));
        for (const chunkType of chunkTypes) {
            const { type, subType } = splitChunkTypeString(chunkType);
            trim({ type, subType, memberOf: groupsPerDocType[subType ?? type] ?? [] });
        }

        await this.setSyncList();
    }

    /**
     * Delete expired documents from the database for non-cms clients
     * @returns
     */
    async deleteExpired() {
        if (config.cms) {
            return;
        }

        const expiredIds = (await this.docs
            .where("expiryDate")
            .belowOrEqual(DateTime.now().toMillis())
            .primaryKeys()) as string[];

        if (expiredIds.length > 0) {
            await this.docs.bulkDelete(expiredIds);
            scheduleCorpusStatsRecompute();
        }
    }

    /**
     * Validates a delete command and returns true if the document referred to in the delete command should be deleted
     */
    validateDeleteCommand(cmd: DeleteCmdDto) {
        if (cmd.deleteReason == DeleteReason.Deleted) {
            return true;
        }

        if (cmd.deleteReason == DeleteReason.StatusChange) {
            // Only delete the document if the client is not a CMS client
            if (!config.cms) return true;
        }

        if (
            cmd.deleteReason == DeleteReason.PermissionChange &&
            // Only delete the document if the client does not have access to the updated MemberOf
            // group, evaluated against the consumer's visibility gate: CmsView for the CMS, View
            // for the app (GitHub #160).
            cmd.newMemberOf &&
            !verifyAccess(
                cmd.newMemberOf,
                cmd.docType,
                config.cms ? AclPermission.CmsView : AclPermission.View,
                "any",
            )
        ) {
            return true;
        }

        return false;
    }

    /**
     * Purge the local database
     */
    async purge() {
        const { syncList } = await import("../api/sync/state");
        syncList.value = [];
        // Also drop the HybridQuery response-cache windows (localStorage) so a later mount can't
        // seed a stale first-paint window from the now-purged dataset.
        const { clearResponseCache } = await import("../util/HybridQuery/responseCache");
        clearResponseCache();
        await Promise.all([
            this.docs.clear(),
            this.localChanges.clear(),
            this.luminaryInternals.clear(),
            // Drop offline-retention stamps too — their docs are being cleared, so leaving the rows
            // would orphan them.
            this.retention.clear(),
        ]);
    }
}

export let db: Database;

export async function initDatabase() {
    const _v: number = await getDbVersion();
    db = new Database(_v, config.docsIndex);

    // Open the database and wait for it to be ready
    await new Promise<void>((resolve) => {
        if (db.isOpen()) {
            resolve();
            return;
        }

        db.on("ready", () => {
            resolve();
        });

        if (!db.isOpen()) {
            db.open();
        }
    });

    db.on("blocked", () => {
        console.error("Database blocked");
    });

    // Compute FTS corpus stats on startup.
    // Uses setTimeout(0) to avoid Dexie PSD zone deadlocks during initialization.
    setTimeout(() => {
        scheduleCorpusStatsRecompute();
    }, 0);

    // Wait a little to give the app time to load before deleting expired content to help speed up the initial app loading time
    setTimeout(() => {
        db.deleteExpired();
    }, 5000);

    // Listen for changes to the access map and delete documents that the user no longer has access to.
    // No `{ immediate: true }`: at init the persisted accessMap may be empty (not-loaded) or stale,
    // and purging against it can over-delete. The server-authoritative map arrives via the socket
    // `clientConfig` event shortly after init and triggers this watcher with real data.
    watchValue(accessMap, (value) => {
        // An empty accessMap means "not loaded yet" (the useLocalStorage default), NOT "no access".
        // Purging on it would match every group with an `acl` field (and every doc with a
        // `memberOf`) and delete them all before the server's clientConfig socket event populates
        // the real map. Logout cleanup goes through purge(), not here.
        if (Object.keys(value).length === 0) return;
        db.deleteRevoked();
    });

    // One-time recovery for clients hit by the historical `deleteRevoked()` over-purge bug:
    // their Group docs were deleted from `docs` while the Group `syncList` block stayed at `eof`,
    // so sync never re-fetched them. Drop the Group block(s) so the next sync starts fresh and
    // re-fetches all accessible groups. Gated by a localStorage flag so it runs at most once.
    // Remove after 2026-09-01 — see bccsa/luminary#1730.
    await resetGroupSyncListForRecovery();

    // Watch syncList for changes and persist to IndexedDB
    import("../api/sync/state").then(({ syncList }) => {
        watch(
            syncList,
            () => {
                db.setSyncList();
            },
            { deep: true },
        );
    });
}

/**
 * One-time recovery: reset the Group `syncList` block(s) so clients previously purged by the
 * `deleteRevoked()` over-purge bug re-fetch their groups on next sync. Idempotent via a
 * localStorage flag. Temporary — remove after 2026-09-01 (bccsa/luminary#1730).
 *
 * Note: the general access-loss reconciliation in `deleteRevoked()` now keeps `syncList` in step
 * with evicted docs for every doc type, so this is no longer the mechanism that prevents the bug —
 * it only un-sticks any client that was already stuck (Group block at `eof` after a purge) and that
 * has not since undergone an access-loss event to self-heal. Not re-bumped for the CmsView rollout:
 * that feature is unreleased, so no client is stuck from it.
 */
async function resetGroupSyncListForRecovery() {
    const RECOVERY_FLAG = "groupSyncListReset_v1";
    if (localStorage.getItem(RECOVERY_FLAG)) return;

    const [{ syncList }, { splitChunkTypeString }] = await Promise.all([
        import("../api/sync/state"),
        import("../api/sync/utils"),
    ]);

    // Load the persisted syncList into the in-memory ref before mutating it.
    await db.getSyncList();

    const hadGroupBlock = syncList.value.some(
        (entry) => splitChunkTypeString(entry.chunkType).type === DocType.Group,
    );

    if (hadGroupBlock) {
        syncList.value = syncList.value.filter(
            (entry) => splitChunkTypeString(entry.chunkType).type !== DocType.Group,
        );
        await db.setSyncList();
    }

    localStorage.setItem(RECOVERY_FLAG, "1");
}

/**
 * Get IndexDB version before DB class is initialized
 * @returns IndexDB Version
 */
export const getDbVersion = async () => {
    const request = indexedDB.open(dbName);
    return new Promise((resolve) => {
        request.onsuccess = (event: any) => {
            const db = event.target.result;
            const version: number = (db && db.version) || 0;
            db.addEventListener("close", () => {});
            db.close();
            resolve(version);
        };
        request.onblocked = () => {
            console.error("Database blocked");
        };
        request.onerror = () => {
            console.error("Database error");
        };
    }) as unknown as Promise<number>;
};

/**
 * Concatenate Shared Library index with the external index, to avoid having duplicate indexes
 * @param index1 - Shared Library Index
 * @param index2 - External Index
 * @returns
 */
const concatIndex = (index1: string, index2: string) => {
    const i1: string[] = index1.replace(/\s/g, "").split(",");
    const i2: string[] = index2.replace(/\s/g, "").split(",");
    const s = new Set([...i1, ...i2]);

    return Array.from(s)
        .filter((val) => val != "")
        .toString();
};

/**
 * Compare current DB index with new DB index to determine if the DB version should be updated
 * @param dbVersion - Current DB version
 * @param oldIndex - Current DB docs index
 * @param newIndex - New DB docs index
 * @returns
 */
const bumpDBVersion = (dbVersion: number, oldIndex: string, newIndex: dbIndex) => {
    if (oldIndex.trim() == JSON.stringify(newIndex).trim()) return dbVersion;
    localStorage.setItem("dexie.dbIndex", JSON.stringify(newIndex));
    console.log(`dbVersion updated from ${dbVersion} to ${dbVersion + 1}`);
    return dbVersion + 1;
};

// suppress DatabaseClosedError - this is not an error, but just a message that says the database has been closed
// but the message comes through as a error, that is why it needs to be suppressed
window.addEventListener("unhandledrejection", (ev) => {
    if (ev.reason.name === "DatabaseClosedError") {
        ev.preventDefault();
    }
});
