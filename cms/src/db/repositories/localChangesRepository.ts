import { LocalChangeStatus, type LocalChange } from "@/types";
import { db } from "../baseDatabase";

export class LocalChangesRepository {
    getUnsynced() {
        return db.localChanges.where("status").equals(LocalChangeStatus.Unsynced).toArray();
    }

    get(id: number) {
        return db.localChanges.where("id").equals(id).first();
    }

    update(change: LocalChange, update: Partial<LocalChange>) {
        return db.localChanges.update(change, update);
    }

    delete(id: number) {
        return db.localChanges.where("id").equals(id).delete();
    }
}
