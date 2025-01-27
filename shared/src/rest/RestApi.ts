import { ApiConnectionOptions, DocType } from "../types";
import { Sync } from "./sync";
import { HttpReq } from "./http";

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
    constructor(options: ApiConnectionOptions) {
        this._sync = new Sync(options);
        this.http = new HttpReq(options.apiUrl || "", options.token);
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
export function getRest(options?: ApiConnectionOptions) {
    if (rest) return rest;

    if (!options) {
        throw new Error("Rest API connection requires options object");
    }
    if (!options.apiUrl) {
        throw new Error("Rest API connection requires an API URL");
    }
    if (!options.docTypes || !options.docTypes[0]) {
        throw new Error(
            "Rest API connection requires an array of DocTypes that needs to be synced",
        );
    }

    rest = new RestApi(options);

    return rest;
}
