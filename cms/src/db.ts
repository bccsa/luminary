import Dexie, { type Table } from "dexie";
import type { BaseDocumentDto } from "./types";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;

    constructor() {
        super("ac-db");
        this.version(2).stores({
            docs: "_id, type",
        });
    }
}

export const db = new BaseDatabase();
