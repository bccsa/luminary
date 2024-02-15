import { LocalChangeStatus, type LocalChange, type Uuid } from "@/types";
import { db } from "../baseDatabase";

export class LocalChangesRepository {
    async findUnsynced() {
        return db.localChanges.where("status").equals(LocalChangeStatus.Unsynced).toArray();
    }

    async startSync(change: LocalChange) {
        return db.localChanges.update(change, {
            status: LocalChangeStatus.Syncing,
        });
    }
    async rejectSync(reqId: Uuid) {
        return db.localChanges.where("reqId").equals(reqId).modify({
            status: LocalChangeStatus.Rejected,
        });
    }

    async delete(reqId: Uuid) {
        return db.localChanges.where("reqId").equals(reqId).delete();
    }
}
