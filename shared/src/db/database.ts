import Dexie, { type Table, liveQuery } from "dexie";
import {
    BaseDocumentDto,
    ContentDto,
    DocType,
    LocalChangeDto,
    TagDto,
    TagType,
    Uuid,
} from "../types";
import { useObservable } from "@vueuse/rxjs";
import type { Observable } from "rxjs";
import { type Ref, toRaw } from "vue";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import { filterAsync, someAsync } from "../util/asyncArray";

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
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<Partial<LocalChangeDto>>; // Partial because it includes id which is only set after saving

    constructor() {
        super("luminary-db");

        // Remember to increase the version number below if you change the schema
        this.version(6).stores({
            docs: "_id, type, parentId, updatedTimeUtc, slug, language, docType, [parentId+type], [parentId+parentType], [type+tagType]",
            localChanges: "++id, reqId, docId, status",
        });
    }

    /**
     * Generate a UUID
     */
    uuid() {
        return uuidv4();
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
     * Get IndexedDB documents by their languageId(s)
     */
    whereLanguage<T extends ContentDto[]>(languageId: Uuid | Uuid[]) {
        if (Array.isArray(languageId)) {
            return this.docs.where("parentId").anyOf(languageId).toArray() as unknown as Promise<T>;
        }

        return this.docs.where("language").equals(languageId).toArray() as unknown as Promise<T>;
    }

    /**
     * Return a list of documents and change documents of specified DocType that are NOT members of the given groupIds
     */
    whereNotMemberOf(groupIds: Array<Uuid>, docType: DocType) {
        // Query groups and group changeDocs
        if (docType === DocType.Group) {
            return db.docs
                .filter((group) => {
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
                })
                .toArray() as unknown as Promise<BaseDocumentDto[]>;
        }

        // Query other documents
        return db.docs.filter((doc) => {
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

        // Optionally only include tags that are not tagged with other tags of the same tag type
        let topLevel = res;
        if (options?.filterOptions?.topLevelOnly) {
            topLevel = await filterAsync(res, async (tag: TagDto) => {
                const hasTagsOfSameType = await someAsync(tag.tags, async (tagId) =>
                    this.isTagType(tagId, tagType),
                );
                return !hasTagsOfSameType;
            });
        }

        // Get the newest content publish date per tag
        const newestContent: { tagId: Uuid; publishDate: number }[] = [];
        const pList = [];
        for (const tag of topLevel) {
            pList.push(
                this.contentWhereTag(tag._id, {
                    languageId: options.languageId,
                    filterOptions: { limit: 1 },
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
        const usedTags = topLevel.filter((tag) => newestContent.some((c) => c.tagId == tag._id));

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

        let res = this.docs
            .where("type")
            .equals(DocType.Content)
            .and((d) => {
                const doc = d as ContentDto;

                // Filter by language
                if (doc.language != options.languageId) return false;

                // Filter by status
                if (doc.status != "published") return false;

                // Filter by publish date
                if (doc.publishDate == undefined || doc.publishDate > Date.now()) return false;

                // Filter by expiry date
                if (doc.expiryDate != undefined && doc.expiryDate < Date.now()) return false;

                // Optionally filter by tagId
                if (!doc.tags || (tagId && !doc.tags.some((tag) => tag == tagId))) return false;

                return true;
            });

        // Optionally limit the number of results
        if (options.filterOptions?.limit) res = res.limit(options.filterOptions.limit);

        // Optionally sort the results
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
        return DateTime.fromMillis(date);
    }

    /**
     * Convert a numeric (UNIX) date to an ISO date string
     * @param date
     * @returns
     */
    toIsoDateTime(date: number) {
        return DateTime.fromMillis(date).toISO({
            includeOffset: false,
            suppressSeconds: true,
        });
    }

    /**
     * Convert a DateTime object to a numeric (UNIX) date
     */
    fromDateTime(date: DateTime) {
        return date.toMillis();
    }

    /**
     * Convert an ISO date string to a numeric (UNIX) date
     * @param date
     * @returns
     */
    fromIsoDateTime(date: string) {
        return DateTime.fromISO(date).toMillis();
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
     * Get all local changes as Vue Ref
     */
    getLocalChangesAsRef() {
        return this.toRef<LocalChangeDto[]>(
            () => this.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
            [],
        );
    }

    /**
     * Get a local change by its id
     */
    getLocalChange(id: number) {
        return this.localChanges.where("id").equals(id).first();
    }

    /**
     * Delete a local change by its id
     */
    deleteLocalChange(id: number) {
        return this.localChanges.where("id").equals(id).delete();
    }
}

// Export a single instance of the database
export const db = new database();
