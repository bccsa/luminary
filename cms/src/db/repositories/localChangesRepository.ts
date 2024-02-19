import { LocalChangeStatus, type LocalChange, type Uuid } from "@/types";
import { db } from "../baseDatabase";

export class LocalChangesRepository {
    getUnsynced() {
        return db.localChanges.where("status").equals(LocalChangeStatus.Unsynced).toArray();
    }

    get(reqId: Uuid) {
        return db.localChanges.where("reqId").equals(reqId).first();
    }

    update(change: LocalChange, update: Partial<LocalChange>) {
        return db.localChanges.update(change, update);
    }

    delete(reqId: Uuid) {
        return db.localChanges.where("reqId").equals(reqId).delete();
    }
}
