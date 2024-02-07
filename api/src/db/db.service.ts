import { Injectable } from "@nestjs/common";
import * as nano from "nano";
import { Group } from "../permissions/permissions.service";

/**
 * @typedef {Object} - getDocsOptions
 * @property {Array<string>} groups - Array with IDs of groups for which member documents should be returned.
 * Note: If the "group" type is included in getDocsOptions.types, the group itself will be included in the result.
 * @property {Array<string>} types - Array of document types to be included in the query result
 * @property {number} from - Include documents with an updateTimeUtc timestamp greater or equal to the passed value. (Default 0)
 */
export type getDocsOptions = {
    groups: Array<string>;
    types: Array<string>;
    from?: number;
};

@Injectable()
export class DbService {
    private db: nano.DocumentScope<unknown>;
    protected syncVersion: number;
    protected syncTolerance: number;

    constructor() {
        this.connect(process.env.DB_CONNECTION_STRING as string, process.env.DB_DATABASE as string);
        this.syncTolerance = Number.parseInt((process.env.SYNC_TOLERANCE as string) || "1000");

        // Populate the permission system
        this.getGroups().then((res: any) => {
            Group.upsertGroups(res.docs);
        });
    }

    /**
     * Connect to the database
     * @param {string} connectionString - CouchDB URL including username and password (http://user:password@hostname_or_ip)
     * @param {string} database - Database name.
     */
    private connect(connectionString: string, database: string) {
        this.db = nano(connectionString).use(database);
    }

    /**
     * Insert or update a document with given ID.
     * @param doc - CouchDB document with an _id field
     */
    upsertDoc(doc: any) {
        return new Promise((resolve, reject) => {
            if (!doc._id) {
                reject("Invalid document: The passed document does not have an '_id' property");
            }
            this.db
                .get(doc._id)
                .then(async (existing) => {
                    // TODO: Only update document if document has changed
                    doc._rev = existing._rev;
                    resolve(await this.db.insert(doc));
                })
                // Create new doc if it does not exit
                .catch(async () => {
                    resolve(await this.db.insert(doc));
                });
        });
    }

    /**
     * Get a document by ID
     * @param id - document ID (_id field)
     */
    getDoc(id: string) {
        return this.db.get(id);
    }

    /**
     * Gets the latest document update time for any documents that has the updatedTimeUtc property
     */
    getLatestDocUpdatedTime(): Promise<number> {
        return new Promise((resolve) => {
            this.db
                .view("sync", "updatedTimeUtc", {
                    limit: 1,
                    descending: true,
                })
                .then((res) => {
                    if (
                        res.rows &&
                        res.rows[0] &&
                        res.rows[0].value &&
                        typeof res.rows[0].value === "number"
                    ) {
                        resolve(res.rows[0].value);
                    } else {
                        resolve(0);
                    }
                });
        });
    }

    /**
     * Gets the update time of the oldest change document.
     */
    getOldestChangeTime(): Promise<number> {
        return new Promise((resolve) => {
            this.db
                .view("sync", "changeUpdatedTimeUtc", {
                    limit: 1,
                })
                .then((res) => {
                    if (
                        res.rows &&
                        res.rows[0] &&
                        res.rows[0].value &&
                        typeof res.rows[0].value === "number"
                    ) {
                        resolve(res.rows[0].value);
                    } else {
                        resolve(0);
                    }
                });
        });
    }

    /**
     * Function used to clear a database
     */
    async destroyAllDocs() {
        const res = await this.db.list();
        const pList = [];
        res.rows.forEach((doc) => {
            pList.push(this.db.destroy(doc.id, doc.value.rev));
        });

        await Promise.all(pList);
    }

    /**
     * Get data to which a user has access to including the user document itself.
     * @param {string} userID - User document ID.
     * @param {getDocsOptions} options - Query configuration object.
     * @returns - Promise containing the query result
     */
    getDocs(userId: string, options: getDocsOptions): Promise<unknown> {
        // Set default options
        if (!options.from) options.from = 0;

        const query = {
            selector: {
                $or: [
                    {
                        _id: userId,
                    },
                    {
                        $and: [
                            {
                                updatedTimeUtc: {
                                    $gte: options.from,
                                },
                            },
                            {
                                type: {
                                    $in: options.types,
                                },
                            },
                            {
                                $or: [
                                    {
                                        // Include documents who are a member of any of the passed groups
                                        memberOf: {
                                            $in: options.groups,
                                        },
                                    },
                                    {
                                        // Include the (group) document itself
                                        _id: {
                                            $in: options.groups,
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        return this.db.find(query);
    }

    /**
     * Get all group documents from database
     */
    getGroups(): Promise<unknown> {
        const query = {
            selector: {
                type: "group",
            },
        };
        return this.db.find(query);
    }
}
