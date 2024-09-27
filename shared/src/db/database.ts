import Dexie, { type Table, liveQuery } from "dexie";
import {
    AclPermission,
    BaseDocumentDto,
    ChangeReqAckDto,
    ContentDto,
    DocType,
    LocalChangeDto,
    PublishStatus,
    TagDto,
    TagType,
    Uuid,
} from "../types";
import { useObservable } from "@vueuse/rxjs";
import type { Observable } from "rxjs";
import { type Ref, toRaw, watch } from "vue";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { filterAsync, someAsync } from "../util/asyncArray";
import { accessMap, getAccessibleGroups } from "../permissions/permissions";

export type queryOptions = {
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

class database extends Dexie {
    // TODO: Make tables private
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<Partial<LocalChangeDto>>; // Partial because it includes id which is only set after saving
    private accessMapRef = accessMap;

    constructor() {
        super("luminary-db");

        // Remember to increase the version number below if you change the schema
        this.version(8).stores({
            docs: "_id, type, parentId, updatedTimeUtc, slug, language, docType, [parentId+type], [parentId+parentType], [type+tagType], publishDate, expiryDate, [type+language], title",
            localChanges: "++id, reqId, docId, status",
        });

        // Listen for changes to the access map and delete documents that the user no longer has access to
        watch(
            this.accessMapRef,
            () => {
                this.deleteRevoked();
            },
            { immediate: true },
        );
    }

    /**
     * Generate a UUID
     */
    uuid() {
        return uuidv4();
    }

    /**
     * Set the sync version as received from the api
     */
    set syncVersion(value: number) {
        localStorage.setItem("syncVersion", value.toString());
    }

    /**
     * Get the stored sync version
     */
    get syncVersion(): number {
        return parseInt(localStorage.getItem("syncVersion") || "0");
    }

    /**
     * Convert a Dexie query to a Vue ref by making use of Dexie's liveQuery and @vueuse/rxjs' useObservable
     * @param query - The query to convert to a ref. The query should be passed as a function as it only gets executed by the liveQuery.
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     * @returns Vue Ref
     */
    toRef<T extends BaseDocumentDto | BaseDocumentDto[] | boolean | LocalChangeDto[]>(
        query: () => Promise<T>,
        initialValue?: T,
    ) {
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
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    getAsRef<T extends BaseDocumentDto>(id: Uuid, initialValue?: T) {
        return this.toRef<T>(() => this.docs.get(id) as unknown as Promise<T>, initialValue);
    }

    /**
     * Get an IndexedDB document by its slug as Vue Ref
     * @param slug - The slug of the document to get
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    getBySlugAsRef<T extends BaseDocumentDto>(slug: string, initialValue?: T) {
        return this.toRef<T>(
            () => this.docs.where("slug").equals(slug).first() as unknown as Promise<T>,
            initialValue,
        );
    }

    /**
     * Bulk insert documents into the database
     */
    bulkPut(docs: BaseDocumentDto[]) {
        return this.docs.bulkPut(docs);
    }

    /**
     * Return true if there are some documents of the specified DocType
     */
    async someByType(docType: DocType) {
        return (await this.docs.where("type").equals(docType).first()) != undefined;
    }

    /**
     * Return true if there are some documents of the specified DocType as Vue Ref
     */
    someByTypeAsRef(docType: DocType) {
        return this.toRef<boolean>(
            () => this.someByType(docType) as unknown as Promise<boolean>,
            false,
        );
    }

    /**
     * Get all IndexedDB documents of a certain type as Vue Ref
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     * @param tagType - Optional: The tag type to filter by (only used for tags)
     * TODO: Add pagination
     */
    whereTypeAsRef<T extends BaseDocumentDto[]>(
        docType: DocType,
        initialValue?: T,
        tagType?: TagType,
    ) {
        if (tagType) {
            return this.toRef<T>(
                () =>
                    this.docs
                        .where({ type: docType, tagType: tagType })
                        .toArray() as unknown as Promise<T>,
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
    async tagsWhereTagType(tagType: TagType, options?: queryOptions): Promise<TagDto[]> {
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
                if (options?.filterOptions?.pinned === true) return t.pinned === true;
                if (options?.filterOptions?.pinned === false) return t.pinned === false;
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
     */
    tagsWhereTagTypeAsRef(tagType: TagType, options?: queryOptions) {
        return this.toRef<TagDto[]>(() => this.tagsWhereTagType(tagType, options), []);
    }

    /**
     * Get all content documents that are tagged with the passed tag ID. If no tagId is passed, return all posts and tags.
     */
    async contentWhereTag(tagId?: Uuid, options?: queryOptions) {
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
     */
    contentWhereTagAsRef(tagId?: Uuid, options?: queryOptions) {
        return this.toRef<ContentDto[]>(() => this.contentWhereTag(tagId, options), []);
    }

    /**
     * Update or insert a document into the database and queue the change to be sent to the API
     */
    async upsert<T extends BaseDocumentDto>(doc: T) {
        // Unwrap the (possibly) reactive object
        const raw = toRaw(doc);

        // Check if the document already exists in the database
        const existingDoc = await this.docs.get(raw._id);

        // Update the document in the docs table. This is a preliminary update, as it will eventually be overwritten by the API response
        if (existingDoc) {
            await this.docs.update(raw._id, raw);
        } else {
            await this.docs.put(raw);
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
     */
    isLocalChangeAsRef(docId: Uuid) {
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
            if (ack.doc) {
                // Replace our local copy with the provided database version
                await this.docs.update(ack.doc._id, ack.doc);
            } else {
                // Otherwise attempt to delete the item, as it might have been a rejected create action
                const change = await this.localChanges.get(ack.id);

                if (change?.doc) {
                    await this.docs.delete(change.doc._id);
                }
            }
        }

        await this.localChanges.delete(ack.id);
    }

    /**
     * Return a list of documents and change documents of specified DocType that are NOT members of the given groupIds as a Dexie collection
     */
    private whereNotMemberOfAsCollection(groupIds: Array<Uuid>, docType: DocType) {
        // Query groups and group changeDocs
        if (docType === DocType.Group) {
            return this.docs.filter((group) => {
                // Check if the ACL field exists
                if (!group.acl) return false;

                // Only include groups and group changes
                if (
                    !(
                        group.type === DocType.Group ||
                        (group.type === DocType.Change && group.docType === DocType.Group)
                    )
                ) {
                    return false;
                }

                // Check if the group is NOT a member of the given groupIds
                return !group.acl.some(
                    (acl) =>
                        acl.type === DocType.Group &&
                        groupIds.includes(acl.groupId) &&
                        acl.permission.some((p) => p === "view"),
                );
            });
        }

        // Query other documents
        return this.docs.filter((doc) => {
            // Check if the memberOf field exists
            if (!doc.memberOf) return false;

            // Only include documents and document changes of the passed DocType
            if (!(doc.type === docType || (doc.type === DocType.Change && doc.docType === docType)))
                return false;

            // Check if the document is NOT a member of the given groupIds
            return !doc.memberOf.some((groupId) => groupIds.includes(groupId));
        });
    }

    /**
     * Delete documents to which access has been revoked
     */
    private deleteRevoked() {
        const groupsPerDocType = getAccessibleGroups(AclPermission.View);

        Object.values(DocType)
            .filter((t) => !(t == DocType.Change || t == DocType.Content))
            .forEach(async (docType) => {
                let groups = groupsPerDocType[docType as DocType];
                if (groups === undefined) groups = [];

                const revokedDocs = this.whereNotMemberOfAsCollection(groups, docType as DocType);

                // Delete associated Post and Tag content documents
                if (docType === DocType.Post || docType === DocType.Tag) {
                    const revokedParents = await revokedDocs.toArray();
                    const revokedParentIds = revokedParents.map((p) => p._id);
                    await this.docs.where("parentId").anyOf(revokedParentIds).delete();
                }

                // Delete associated Language content documents
                if (docType === DocType.Language) {
                    const revokedLanguages = await revokedDocs.toArray();
                    const revokedlanguageIds = revokedLanguages.map((l) => l._id);
                    await this.docs.where("language").anyOf(revokedlanguageIds).delete();
                }

                await revokedDocs.delete();
            });
    }

    /**
     * Purge the local database
     */
    async purge() {
        await Promise.all([this.docs.clear(), this.localChanges.clear()]);
        this.syncVersion = 0;
    }
}

// Export a single instance of the database
export const db = new database();
