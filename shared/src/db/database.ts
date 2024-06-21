import Dexie, { type Table, liveQuery } from "dexie";
import { BaseDocumentDto, ContentDto, DocType, LocalChangeDto, TagType, Uuid } from "../types";
import { useObservable } from "@vueuse/rxjs";
import type { Observable } from "rxjs";
import { type Ref, toRaw } from "vue";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";

export class database extends Dexie {
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
    whereParent<T extends ContentDto[]>(
        parentId: Uuid | Uuid[],
        parentType?: DocType.Post | DocType.Tag,
    ) {
        if (Array.isArray(parentId)) {
            if (!parentType) {
                return this.docs
                    .where("parentId")
                    .anyOf(parentId)
                    .toArray() as unknown as Promise<T>;
            }
            return this.docs
                .where("parentId")
                .anyOf(parentId)
                .and((d) => d.parentType == parentType)
                .toArray() as unknown as Promise<T>;
        }

        if (!parentType) {
            return this.docs.where({ parentId }).toArray() as unknown as Promise<T>;
        }
        return this.docs.where({ parentId, parentType }).toArray() as unknown as Promise<T>;
    }

    /**
     * Get IndexedDB documents by their parentId(s) as Vue Ref
     * @param parentId - The parentId(s) to filter by
     * @param parentType - Optional: The parent type to filter by
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    whereParentAsRef<T extends ContentDto[]>(
        parentId: Uuid | Uuid[],
        parentType?: DocType.Post | DocType.Tag,
        initialValue?: T,
    ) {
        return this.toRef<T>(() => this.whereParent<T>(parentId, parentType), initialValue);
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
