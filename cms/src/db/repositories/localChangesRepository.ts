import { LocalChangeStatus, type LocalChange, type Uuid } from "@/types";
import { db } from "../baseDatabase";

export class LocalChangesRepository {
    async findUnsynced() {
        return db.localChanges.where("status").equals(LocalChangeStatus.Unsynced).toArray();
    }

    async update(change: LocalChange, update: object) {
        return db.localChanges.update(change, update);
    }

    async delete(reqId: Uuid) {
        return db.localChanges.where("reqId").equals(reqId).delete();
    }
}
