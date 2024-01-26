import { Injectable } from "@nestjs/common";
import * as nano from "nano";

@Injectable()
export class DbService {
    private db: nano.DocumentScope<unknown>;
    protected syncVersion: number;
    protected syncTolerance: number;

    constructor() {
        console.log(process.env);

        this.connect(process.env.DB_CONNECTION_STRING as string, process.env.DB_DATABASE as string);
        this.syncTolerance = Number.parseInt((process.env.SYNC_TOLERANCE as string) || "1000");
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
    getLatestUpdatedTime(): Promise<number> {
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
     * Gets the update time of the oldest changelog document.
     */
    getOldestChangelogEntryUpdatedTime(): Promise<number> {
        return new Promise((resolve) => {
            this.db
                .view("sync", "changelogUpdatedTimeUtc", {
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
     * Get data to which a user has access and has subscribed to
     * @param {Array<string>} accessTags - Array with access tag ID's
     * @param {Array<string>} subscriptionTags - Array with subscription tag ID's
     * @returns - Promise containing the query result
     */
    getDocs(accessTags: Array<string>, subscriptionTags: Array<string>) {
        const query = {
            selector: {
                // TODO: determine if we need to filter on content type here or perhaps exclude certain types of content in the query?
                // type: "post",
                // tag criteria:
                // return all documents matching any of the user's access tags AND matching any of the user's subscription tags
                $and: [
                    {
                        tags: {
                            $in: accessTags,
                        },
                    },
                    {
                        tags: {
                            $in: subscriptionTags,
                        },
                    },
                ],
            },
        };
        return this.db.find(query);
    }

    /**
     * Get all directly and indirectly related (child) tag ID's
     * @param {Array} tagIDs - Array of tag ID's
     * @returns - Promise containing an array of related tag ID's (i.e. which directly or indirectly has been tagged with one of the passed tag ID's). The passed tag ID's are also included in the result.
     */
    getRelatedTags(tagIDs) {
        return new Promise((resolve) => {
            const res = [];
            const pList = [];
            res.push(...tagIDs);

            this.db.view("tag", "tagChildRelation", { keys: tagIDs }).then((q) => {
                if (q.rows) {
                    // Iterate through children
                    q.rows.forEach((row) => {
                        pList.push(
                            this.getRelatedTags([row.id]).then((r: Array<string>) => {
                                res.push(...r);
                            }),
                        );
                    });

                    Promise.all(pList).then(() => {
                        // Get unique values. This might not be the most efficient way.
                        // It might be better to do a unique after the full iterative lookup is done.
                        const unique = res.filter((value, index, array) => {
                            return array.indexOf(value) === index;
                        });
                        resolve(unique);
                    });
                }
            });
        });
    }
}
