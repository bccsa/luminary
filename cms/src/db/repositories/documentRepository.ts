import type { BaseDocumentDto, Uuid } from "@/types";
import { db } from "../baseDatabase";

export class DocumentRepository {
    update(doc: BaseDocumentDto) {
        return db.docs.update(doc._id, doc);
    }

    delete(docId: Uuid) {
        return db.docs.delete(docId);
    }
}
