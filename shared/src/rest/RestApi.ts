import { DocType } from "../types";
import { Sync } from "./sync";
import { HttpReq } from "./http";
import { config } from "../config";

export type ApiSearchQuery = {
    apiVersion?: string;
    limit?: number;
    offset?: number;
    sort?: "desc" | "asc";
    groups?: Array<string>;
    types: Array<DocType>;
    contentOnly?: boolean;
    queryString?: string;
    from?: number;
    to?: number;
    languages?: Array<string>;
};

export type ApiDocTypes = {
    type: DocType;
    contentOnly: boolean;
    syncPriority: number; // 10 is default, lower number is higher priority
    skipWaitForLanguageSync?: boolean;
};

export type ChangeRequestQuery = {
    id: number;
    doc: any;
    apiVersion?: string;
};

class RestApi {
    private _sync: Sync;
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
        if (!config.docTypes || !config.docTypes[0]) {
            throw new Error(
                "The REST API connection requires an array of DocTypes that needs to be synced",
            );
        }

        this._sync = new Sync();
        this.http = new HttpReq(config.apiUrl || "", config.token);
    }

    /**
     * Returns the REST API Client's sync instance
     */
    get sync() {
        return this._sync;
    }

    async search(query: ApiSearchQuery) {
        query.apiVersion = "0.0.0";
        return await this.http.get("search", query);
    }

    async changeRequest(query: ChangeRequestQuery) {
        query.apiVersion = "0.0.0";
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
