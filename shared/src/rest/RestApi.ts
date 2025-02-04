import { DocType } from "../types";
import { Sync } from "./sync";
import { HttpReq } from "./http";
import { config } from "../config";
import { accessMap } from "../permissions/permissions";

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
     * Create a new docs instance
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
        if (!accessMap.value || Object.keys(accessMap.value).length === 0) {
            throw new Error(
                "The REST API connection requires an access map to be set before connecting",
            );
        }

        this._sync = new Sync();
        this.http = new HttpReq(config.apiUrl || "", config.token);
    }

    async clientDataReq() {
        this._sync.clientDataReq();
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
 * Returns a singleton instance of the restApi client class. The api URL, token and CMS flag is only used when calling the function for the first time.
 * @param options - Socket connection options
 */
export function getRest() {
    if (rest) return rest;

    rest = new RestApi();
    return rest;
}
