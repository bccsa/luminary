import { db } from "@/db/baseDatabase";

export const purgeLocalDatabase = async () => {
    await Promise.all([db.docs.clear(), db.localChanges.clear()]);
};
