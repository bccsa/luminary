import Dexie, { type Table } from "dexie";
import type { BaseDocumentDto, LocalChange } from "@/types";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<Partial<LocalChange>>; // Partial because it includes id which is only set after saving

    constructor() {
        super("ac-db");
        this.version(5).stores({
            docs: "_id, type",
            localChanges: "++id, reqId, docId, status",
        });
    }
}

export const db = new BaseDatabase();
