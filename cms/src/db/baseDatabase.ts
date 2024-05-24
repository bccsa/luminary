import Dexie, { liveQuery, type Table } from "dexie";
import type { BaseDocumentDto, LocalChange, Uuid } from "@/types";
import { useObservable } from "@vueuse/rxjs";
import type { Observable } from "rxjs";
import { toRaw, type Ref } from "vue";
import { DateTime } from "luxon";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<Partial<LocalChange>>; // Partial because it includes id which is only set after saving

    constructor() {
        super("luminary-db");

        // Remember to increase the version number below if you change the schema
        this.version(4).stores({
            docs: "_id, type, parentId, updatedTimeUtc, slug, language, docType, [parentId+type]",
            localChanges: "++id, reqId, docId, status",
        });
    }

    /**
     * Convert a Dexie query to a Vue ref by making use of Dexie's liveQuery and @vueuse/rxjs' useObservable
     * @param query - The query to convert to a ref. The query should be passed as a function as it only gets executed by the liveQuery.
     * @returns Vue Ref
     */
    toRef<T extends BaseDocumentDto>(query: () => Promise<T>) {
        return useObservable(
            liveQuery(async () => {
                return await query();
            }) as unknown as Observable<T>,
            { initialValue: query() },
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
     */
    getAsRef<T extends BaseDocumentDto>(id: Uuid) {
        return this.toRef<T>(() => this.docs.get(id) as unknown as Promise<T>);
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
        });
    }

    /**
     * Convert a numeric (UNIX) date to a DateTime object
     * @param date
     * @returns
     */
    toDateTime(date: number) {
        return DateTime.fromMillis(date);
    }

    /**
     * Convert a DateTime object to a numeric (UNIX) date
     * @param date
     * @returns
     */
    fromDateTime(date: DateTime) {
        return date.toMillis();
    }
}

// Export a single instance of the database
export const db = new BaseDatabase();
