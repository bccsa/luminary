import Dexie, { Collection, IndexableType, type Table, liveQuery } from "dexie";
import {
    AclPermission,
    BaseDocumentDto,
    ChangeReqAckDto,
    ContentDto,
    DeleteCmdDto,
    DeleteReason,
    DocType,
    LocalChangeDto,
    PostType,
    PublishStatus,
    queryCacheDto,
    TagDto,
    TagType,
    Uuid,
} from "../types";
import { useObservable } from "@vueuse/rxjs";
import type { Observable } from "rxjs";
import { ref, type Ref, toRaw, watch } from "vue";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { filterAsync, someAsync } from "../util/asyncArray";
import { accessMap, getAccessibleGroups, verifyAccess } from "../permissions/permissions";
import { config } from "../config";
import { changeReqErrors, changeReqWarnings } from "../config";
import { cloneDeep } from "lodash-es";

const dbName: string = "luminary-db";

type LuminaryInternals = {
    id: string;
    value: any;
};

export type SyncMapEntry = {
    blockStart: number;
    blockEnd: number;
};

export type SyncMap = {
    blocks: Array<SyncMapEntry>;
    groups: Array<string>;
    contentOnly?: boolean;
    types: Array<string>;
    languages: Array<string>;
    skipWaitForLanguageSync?: boolean;
    id: string;
    syncPriority: number; // default 0, a higher number is a higher priority
};

export const syncMap = ref(new Map<string, SyncMap>());

type dbIndex = {
    docs: string;
    localChanges: string;
    queryCache: string;
    luminaryInternals: string;
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
    queryCache!: Table<queryCacheDto<BaseDocumentDto>>;
    luminaryInternals!: Table<LuminaryInternals>;

    /**
     * Luminary Shared Database class
     * @param dbVersion - Current Dexie DB version
     * @param docsIndex - App specific Index
     */
    constructor(dbVersion: number, docsIndex: string) {
        super(dbName);
        this.requestIndexDbPersistent();

        const index: string = concatIndex(
            "_id,type,parentType,language,expiryDate,parentId,publishDate,parentPinned,[type+tagType],[type+postType]",
            docsIndex,
        ); // Concatenate and compact app specific indexed fields with shared library indexed fields
        const dbIndex: dbIndex = {
            docs: index,
            localChanges: "++id, reqId, docId, status",
            queryCache: "id",
            luminaryInternals: "id",
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

    async getSyncMap() {
        const _v = await this.getLuminaryInternals("syncMap");
        if (_v)
            for (const [k, v] of Object.entries(_v)) {
                syncMap.value.set(k, v as SyncMap);
            }
        return _v;
    }

    async setSyncMap() {
        return await this.setLuminaryInternals(
            "syncMap",
            cloneDeep(Object.fromEntries(syncMap.value)),
        );
    }

    async getSyncList() {
        const _v = await this.getLuminaryInternals("syncList");
        if (_v && Array.isArray(_v)) {
            const { syncList } = await import("../rest/sync2/state");
            syncList.value = _v;
        }
        return _v;
    }

    async setSyncList() {
        const { syncList } = await import("../rest/sync2/state");
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
     * Convert a Dexie query to a Vue ref by making use of Dexie's liveQuery and @vueuse/rxjs' useObservable
     * @deprecated - use useDexieLiveQuery / useDexieLiveQueryWithDeps / useDexieLiveQueryAsEditable instead
     * @param query - The query to convert to a ref. The query should be passed as a function as it only gets executed by the liveQuery.
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     * @returns Vue Ref
     */
    toRef<T extends BaseDocumentDto | BaseDocumentDto[] | boolean | LocalChangeDto[]>(
        query: () => Promise<T>,
        initialValue?: T,
    ) {
        console.log(
            "toRef is deprecated - use useDexieLiveQuery / useDexieLiveQueryWithDeps / useDexieLiveQueryAsEditable instead",
        );
        return useObservable(
            liveQuery(async () => {
                return await query();
            }) as unknown as Observable<T>,
            { initialValue },
        ) as Ref<T>;
    }

    /**
     * Get an IndexedDB document by its id
     */
    get<T extends BaseDocumentDto>(id: Uuid) {
        return this.docs.get(id) as unknown as Promise<T>;
    }

    /**
     * Get an IndexedDB document as Vue Ref by its id
     * @deprecated Use useDexieLiveQuery instead
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    getAsRef<T extends BaseDocumentDto>(id: Uuid, initialValue?: T) {
        console.log("getAsRef is deprecated - use useDexieLiveQuery instead");
        return this.toRef<T>(() => this.docs.get(id) as unknown as Promise<T>, initialValue);
    }

    /**
     * Get an IndexedDB document by its slug as Vue Ref
     * @deprecated Use useDexieLiveQuery instead
     * @param slug - The slug of the document to get
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    getBySlugAsRef<T extends BaseDocumentDto>(slug: string, initialValue?: T) {
        console.log("getBySlugAsRef is deprecated - use useDexieLiveQuery instead");
        return this.toRef<T>(
            () => this.docs.where("slug").equals(slug).first() as unknown as Promise<T>,
            initialValue,
        );
    }

    /**
     * Bulk insert documents into the database, and delete documents that are marked for deletion
     */
    bulkPut(docs: BaseDocumentDto[]) {
        // Delete documents that are marked for deletion
        const deleteCmds = docs.filter((doc) => doc.type === DocType.DeleteCmd) as DeleteCmdDto[];
        // #region agent log
        if (deleteCmds.length > 0) {
            deleteCmds.forEach(cmd => {
                const shouldDelete = this.validateDeleteCommand(cmd);
                fetch('http://127.0.0.1:7242/ingest/fbd0d65a-cda8-4de4-aab5-519c4de28ff2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.ts:282',message:'Processing deleteCmd',data:{docId:cmd.docId,docType:cmd.docType,deleteReason:cmd.deleteReason,shouldDelete,newMemberOf:cmd.newMemberOf},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            });
        }
        // #endregion
        const toDeleteIds = docs
            .filter((doc) => {
                if (doc.type !== DocType.DeleteCmd) return false;

                return this.validateDeleteCommand(doc as DeleteCmdDto);
            })
            .map((doc) => (doc as DeleteCmdDto).docId);

        if (toDeleteIds.length > 0) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/fbd0d65a-cda8-4de4-aab5-519c4de28ff2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.ts:291',message:'Bulk deleting documents',data:{toDeleteIds,count:toDeleteIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            this.docs.bulkDelete(toDeleteIds);
        }

        // Insert all documents except delete commands
        return this.docs.bulkPut(docs.filter((doc) => doc.type !== DocType.DeleteCmd));
    }

    /**
     * Return true if there are some documents of the specified DocType
     */
    async someByType(docType: DocType) {
        return (await this.docs.where("type").equals(docType).first()) != undefined;
    }

    /**
     * Return true if there are some documents of the specified DocType as Vue Ref
     * @deprecated Use useDexieLiveQuery instead
     */
    someByTypeAsRef(docType: DocType) {
        console.log("someByTypeAsRef is deprecated - use useDexieLiveQuery instead");
        return this.toRef<boolean>(
            () => this.someByType(docType) as unknown as Promise<boolean>,
            false,
        );
    }

    /**
     * Get all IndexedDB documents of a certain type as Vue Ref
     * @deprecated Use useDexieLiveQuery instead
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     * @param postOrTagType - Optional: The tag type or post type to filter by
     * TODO: Add pagination
     */
    whereTypeAsRef<T extends BaseDocumentDto[]>(
        docType: DocType,
        initialValue?: T,
        postOrTagType?: TagType | PostType,
    ) {
        console.log("whereTypeAsRef is deprecated - use useDexieLiveQuery instead");
        if (postOrTagType) {
            // Check if postOrTagType is a TagType by checking if it's included in TagType values
            const isTagType = Object.values(TagType).includes(postOrTagType as TagType);

            const query = {
                type: docType,
                ...(isTagType
                    ? { tagType: postOrTagType as TagType }
                    : { postType: postOrTagType as PostType }),
            };

            return this.toRef<T>(
                () => this.docs.where(query).toArray() as unknown as Promise<T>,
                initialValue,
            );
        }

        return this.toRef<T>(
            () => this.docs.where("type").equals(docType).toArray() as unknown as Promise<T>,
            initialValue,
        );
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
     * Get IndexedDB documents by their parentId(s) as Vue Ref
     * @deprecated Use useDexieLiveQuery instead
     * @param parentId - The parentId(s) to filter by
     * @param parentType - Optional: The parent type to filter by
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    whereParentAsRef(
        parentId: Uuid | Uuid[],
        parentType?: DocType.Post | DocType.Tag,
        languageId?: Uuid,
        initialValue?: ContentDto[],
    ) {
        console.log("whereParentAsRef is deprecated - use useDexieLiveQuery instead");
        return this.toRef<ContentDto[]>(
            () => this.whereParent(parentId, parentType, languageId),
            initialValue,
        );
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
     * Get all tags of a certain tag type as Vue Ref
     * @deprecated Use useDexieLiveQuery instead
     */
    tagsWhereTagTypeAsRef(tagType: TagType, options?: QueryOptions) {
        console.log("tagsWhereTagTypeAsRef is deprecated - use useDexieLiveQuery instead");
        return this.toRef<TagDto[]>(() => this.tagsWhereTagType(tagType, options), []);
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
     * Get all posts and tags that are tagged with the passed tag ID as Vue Ref
     * @deprecated Use useDexieLiveQuery instead
     */
    contentWhereTagAsRef(tagId?: Uuid, options?: QueryOptions) {
        console.log("contentWhereTagAsRef is deprecated - use useDexieLiveQuery instead");
        return this.toRef<ContentDto[]>(() => this.contentWhereTag(tagId, options), []);
    }

    /**
     * Update or insert a document into the database and queue the change to be sent to the API. If the deleteReq flag is set, the document will be deleted from the local database and the document with deleteReq flag will be queued to be sent to the API.
     * @param options {UpsertOptions} - The options to upsert a document
     */
    async upsert<T extends BaseDocumentDto>(options: UpsertOptions<T>) {
        // Unwrap the (possibly) reactive object
        const raw = toRaw(options.doc);

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
            // Delete the previous change from the localChanges table (if any)
            await this.localChanges.where({ docId: raw._id }).delete();
        }

        // Queue the change to be sent to the API
        await this.localChanges.put({
            doc: raw,
            docId: raw._id,
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
     * Check if a document is queued in the localChanges table
     * @deprecated - use useDexieLiveQueryAsEditable instead
     */
    isLocalChangeAsRef(docId: Uuid) {
        console.log("isLocalChangeAsRef is deprecated - use useDexieLiveQueryAsEditable instead");
        return this.toRef<boolean>(
            () =>
                this.localChanges
                    .where({ docId })
                    .first()
                    .then((res) => {
                        return res ? true : false;
                    }) as unknown as Promise<boolean>,
            false,
        );
    }

    /**
     * Get all local changes
     */
    getLocalChanges() {
        return this.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>;
    }

    /**
     * Apply a change request ack from the API
     */
    async applyLocalChangeAck(ack: ChangeReqAckDto) {
        if (ack.ack == "rejected") {
            changeReqErrors.value.push(ack.message || "Unknown error occured");
            if (ack.docs && Array.isArray(ack.docs)) {
                // Replace our local copy(s) with the provided database version
                await this.docs.bulkPut(ack.docs);
            } else {
                // Otherwise attempt to delete the item, as it might have been a rejected create action
                const change = await this.localChanges.get(ack.id);

                if (change?.doc) {
                    await this.docs.delete(change.doc._id);
                }
            }
        }

        if (ack.ack == "accepted" && ack.warnings && ack.warnings.length > 0) {
            changeReqWarnings.value = ack.warnings;
        }

        await this.localChanges.delete(ack.id);
    }

    /**
     * Set a query result to the query cache
     * @param id - Unique ID for the query
     * @param result - The query result to be stored
     */
    async setQueryCache<T extends BaseDocumentDto[]>(id: string, result: T) {
        return await this.queryCache.put({ id, result: toRaw(result) });
    }

    /**
     * Get a query result from the query cache
     * @param id - Unique ID for the query
     */
    async getQueryCache<T extends BaseDocumentDto[]>(id: string) {
        return ((await this.queryCache.get(id))?.result as T) || Array<T>();
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
        const groupsPerDocType = getAccessibleGroups(AclPermission.View);

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

                // Clear the query cache if any documents are to be deleted
                if ((await revokedDocs.count()) > 0) {
                    await this.queryCache.clear();
                }

                await revokedDocs.delete();
            });
    }

    /**
     * Delete expired documents from the database for non-cms clients
     * @returns
     */
    async deleteExpired() {
        if (config.cms) {
            return;
        }

        await this.docs.where("expiryDate").belowOrEqual(DateTime.now().toMillis()).delete();
    }

    /**
     * Validates a delete command and returns true if the document referred to in the delete command should be deleted
     */
    validateDeleteCommand(cmd: DeleteCmdDto) {
        // #region agent log
        const logData: any = {docId:cmd.docId,docType:cmd.docType,deleteReason:cmd.deleteReason};
        // #endregion
        if (cmd.deleteReason == DeleteReason.Deleted) {
            // #region agent log
            logData.result = true;
            logData.reason = 'Deleted';
            fetch('http://127.0.0.1:7242/ingest/fbd0d65a-cda8-4de4-aab5-519c4de28ff2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.ts:813',message:'validateDeleteCommand result',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return true;
        }

        if (cmd.deleteReason == DeleteReason.StatusChange) {
            // Only delete the document if the client is not a CMS client
            const result = !config.cms;
            // #region agent log
            logData.result = result;
            logData.reason = 'StatusChange';
            logData.cms = config.cms;
            fetch('http://127.0.0.1:7242/ingest/fbd0d65a-cda8-4de4-aab5-519c4de28ff2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.ts:817',message:'validateDeleteCommand result',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return result;
        }

        if (
            cmd.deleteReason == DeleteReason.PermissionChange &&
            // Only delete the document if the client does not have access to the updated MemberOf group
            cmd.newMemberOf &&
            !verifyAccess(cmd.newMemberOf, cmd.docType, AclPermission.View, "any")
        ) {
            // #region agent log
            logData.result = true;
            logData.reason = 'PermissionChange';
            logData.newMemberOf = cmd.newMemberOf;
            fetch('http://127.0.0.1:7242/ingest/fbd0d65a-cda8-4de4-aab5-519c4de28ff2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.ts:822',message:'validateDeleteCommand result',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return true;
        }

        // #region agent log
        logData.result = false;
        logData.reason = 'No match';
        fetch('http://127.0.0.1:7242/ingest/fbd0d65a-cda8-4de4-aab5-519c4de28ff2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'database.ts:831',message:'validateDeleteCommand result',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return false;
    }

    /**
     * Purge the local database
     */
    async purge() {
        syncMap.value.clear();
        const { syncList } = await import("../rest/sync2/state");
        syncList.value = [];
        await Promise.all([
            this.docs.clear(),
            this.localChanges.clear(),
            this.queryCache.clear(),
            this.luminaryInternals.clear(),
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

    // Wait a little to give the app time to load before deleting expired content to help speed up the initial app loading time
    setTimeout(() => {
        db.deleteExpired();
    }, 5000);

    // Listen for changes to the access map and delete documents that the user no longer has access to
    watch(
        accessMap,
        () => {
            db.deleteRevoked();
        },
        { immediate: true },
    );

    watch(
        syncMap,
        () => {
            db.setSyncMap();
        },
        { deep: true },
    );

    // Watch syncList for changes and persist to IndexedDB
    import("../rest/sync2/state").then(({ syncList }) => {
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
