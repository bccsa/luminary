import { db } from "../baseDatabase";

export class LocalChangesRepository {
    getAll() {
        return db.localChanges.toArray();
    }

    get(id: number) {
        return db.localChanges.where("id").equals(id).first();
    }

    delete(id: number) {
        return db.localChanges.where("id").equals(id).delete();
    }
}
