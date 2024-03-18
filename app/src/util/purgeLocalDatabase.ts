import { db } from "@/db/baseDatabase";

export const purgeLocalDatabase = async () => {
    await Promise.all([db.docs.clear()]);

    // We need to set the sync version to 0 to ensure that we get all documents from the server
    localStorage.setItem("syncVersion", "0");
};
