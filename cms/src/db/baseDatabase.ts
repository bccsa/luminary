import Dexie, { type Table } from "dexie";
import type { BaseDocumentDto, LocalChange } from "@/types";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<Partial<LocalChange>>; // Partial because it includes id which is only set after saving

    constructor() {
        super("luminary-db");

        // Remember to increase the version number below if you change the schema
        this.version(3).stores({
            docs: "_id, type, parentId, updatedTimeUtc, slug, language, docType",
            localChanges: "++id, reqId, docId, status",
        });
    }
}

export const db = new BaseDatabase();
