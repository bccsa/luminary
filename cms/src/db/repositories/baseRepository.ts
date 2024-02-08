import { DocType, type Uuid } from "@/types";
import { db } from "../baseDatabase";

export class BaseRepository {
    whereType(docType: DocType) {
        return db.docs.where("type").equals(docType);
    }

    whereId(id: Uuid) {
        return db.docs.where("_id").equals(id);
    }

    whereIds(ids: Uuid[]) {
        return db.docs.where("_id").anyOf(ids);
    }
}
