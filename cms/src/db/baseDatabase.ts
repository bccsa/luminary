import Dexie, { type Table } from "dexie";
import type { BaseDocumentDto, ChangeReqDto } from "@/types";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;
    localChanges!: Table<ChangeReqDto>;

    constructor() {
        super("ac-db");
        this.version(3).stores({
            docs: "_id, type",
            localChanges: "++id, docId",
        });
    }
}

export const db = new BaseDatabase();
