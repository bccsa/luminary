import Dexie, { type Table } from "dexie";
import type { BaseDocumentDto, LocalChange } from "@/types";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<LocalChange>;

    constructor() {
        super("ac-db");
        this.version(4).stores({
            docs: "_id, type",
            localChanges: "++id, reqId, docId",
        });
    }
}

export const db = new BaseDatabase();
