import { HttpReq } from "./http";
import { ApiConnectionOptions, DocType } from "../types";

export type ApiSearchQuery = {
    apiVersion: string;
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

export class Search {
    private http: HttpReq<ApiSearchQuery>;

    constructor(options: ApiConnectionOptions) {
        this.http = new HttpReq(options.apiUrl || "", options.token);
    }

    async search(query: ApiSearchQuery) {
        return await this.http.get("search", query);
    }
}
