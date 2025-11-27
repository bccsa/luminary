import { DocType, LocalChangeDto } from "../types";
import { syncActive } from "./sync";
import { HttpReq } from "./http";
import { config } from "../config";
import { LFormData } from "../util/LFormData";
import { db } from "../db/database";
import { useDexieLiveQuery } from "../util";
import { syncLocalChanges } from "./syncLocalChanges";

export type ApiSearchQuery = {
    apiVersion?: string;
    limit?: number;
    offset?: number;
    sort?: Array<{ [key: string]: "asc" | "desc" }>;
    groups?: Array<string>;
    types?: Array<DocType>;
    contentOnly?: boolean;
    queryString?: string;
    from?: number;
    to?: number;
    languages?: Array<string>;
    includeDeleteCmds?: boolean;
    docId?: string;
    slug?: string;
    parentId?: string;
};

/**
 * API Sync query object. This is used to construct Search API queries for syncing data from the server,
 * but is also passed to the Socket.io connection to filter the data that is sent to the client.
 */
export type ApiSyncQuery = {
    type: DocType;
    /**
     * If true, only include content documents for the specified (Post / Tag) document type for syncing.
     */
    contentOnly?: boolean;
    /**
     * If true, the query is used for syncing. If false, the query is used for live updates only.
     * @default true
     */
    sync?: boolean; // true if the query is used for syncing
    /**
     * 10 is default, lower number is higher priority
     */
    syncPriority?: number;
    /**
     * When true, sync immediately and do not want for the language sync to finish
     * TODO: Rename to something more meaningful
     */
    skipWaitForLanguageSync?: boolean;
};

export type ChangeRequestQuery = {
    id: number;
    doc: any;
    apiVersion?: string;
};

export { syncActive };

class RestApi {
    // private _sync: Sync;
    private http: HttpReq<any>;
    /**
     * Create a new REST API client instance
     * @param options - Options
     */
    constructor() {
        if (!config) {
            throw new Error("The REST API connection requires options object");
        }
        if (!config.apiUrl) {
            throw new Error("The REST API connection requires an API URL");
        }
        if (!config.syncList || !config.syncList[0]) {
            throw new Error(
                "The REST API connection requires an array of DocTypes that needs to be synced",
            );
        }

        // this._sync = new Sync();
        this.http = new HttpReq(config.apiUrl || "", config.token);

        const localChanges = useDexieLiveQuery(
            () => db.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
            { initialValue: [] as unknown as LocalChangeDto[] },
        );
        syncLocalChanges(localChanges);
    }

    // /**
    //  * Returns the REST API Client's sync instance
    //  */
    // get sync() {
    //     return this._sync;
    // }

    async search(query: ApiSearchQuery) {
        query.apiVersion = "0.0.0";
        return await this.http.get("search", query); //TODO: Add type: ApiQueryResult<T>
    }

    async changeRequest(query: ChangeRequestQuery | FormData) {
        if (query instanceof LFormData) {
            (query as LFormData).append("changeRequestApiVersion", "0.0.0");
        }
        (query as ChangeRequestQuery).apiVersion = "0.0.0";
        return await this.http.post("changerequest", query);
    }
}

let rest: RestApi;

/**
 * Returns a singleton instance of the REST client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getRest(
    options: {
        /**
         * If true, the singleton instance of the REST client will be reset
         */
        reset?: boolean;
    } = { reset: false },
): RestApi {
    if (rest && !options.reset) return rest;

    rest = new RestApi();

    return rest;
}
