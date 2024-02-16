import { LocalChangeStatus, type LocalChange, type Uuid } from "@/types";
import { db } from "../baseDatabase";

export class LocalChangesRepository {
    getUnsynced() {
        return db.localChanges.where("status").equals(LocalChangeStatus.Unsynced).toArray();
    }

    async getDocId(reqId: Uuid) {
        return (await db.localChanges.where("reqId").equals(reqId).first())?.docId as Uuid;
    }

    update(change: LocalChange, update: object) {
        return db.localChanges.update(change, update);
    }

    delete(reqId: Uuid) {
        return db.localChanges.where("reqId").equals(reqId).delete();
    }
}
