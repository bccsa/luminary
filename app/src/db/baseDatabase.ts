import Dexie, { type Table } from "dexie";
import type { BaseDocumentDto } from "@/types";

export class BaseDatabase extends Dexie {
    docs!: Table<BaseDocumentDto>;

    constructor() {
        super("luminary-db");

        // Remember to increase the version number below if you change the schema
        this.version(6).stores({
            docs: "_id, type, parentId, updatedTimeUtc, slug, language, docType, [parentId+type]",
        });
    }
}

export const db = new BaseDatabase();
