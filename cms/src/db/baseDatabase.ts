import Dexie, { liveQuery, type Table } from "dexie";
import type { BaseDocumentDto, DocType, LocalChangeDto, TagType, Uuid } from "@/types";
import { useObservable } from "@vueuse/rxjs";
import type { Observable } from "rxjs";
import { toRaw, type Ref } from "vue";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";

export class BaseDatabase extends Dexie {
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
    toRef<T extends BaseDocumentDto | BaseDocumentDto[] | boolean>(
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
                    this.docs.where({ type: docType, tagType }).toArray() as unknown as Promise<T>,
                initialValue,
            );
        }

        return this.toRef<T>(
            () => this.docs.where("type").equals(docType).toArray() as unknown as Promise<T>,
            initialValue,
        );
    }

    /**
     * Get IndexedDB documents by their parentId
     */
    whereParent<T extends BaseDocumentDto[]>(
        parentId: Uuid,
        parentType: DocType.Post | DocType.Tag,
    ) {
        return this.docs.where({ parentId, parentType }).toArray() as unknown as Promise<T>;
    }

    /**
     * Get IndexedDB documents by their parentId as Vue Ref
     * @param initialValue - The initial value of the ref while waiting for the query to complete
     */
    whereParentAsRef<T extends BaseDocumentDto[]>(
        parentId: Uuid,
        parentType: DocType.Post | DocType.Tag,
        initialValue?: T,
    ) {
        return this.toRef<T>(() => this.whereParent<T>(parentId, parentType), initialValue);
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
    isLocalChange(docId: Uuid) {
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
}

// Export a single instance of the database
export const db = new BaseDatabase();
