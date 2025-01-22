import { HttpReq } from "./http";
import { ApiConnectionOptions, DocType } from "../types";

export type ApiQuery = {
    apiVersion: string;
    limit?: number;
    offset?: number;
    sort?: "desc" | "asc";
    groups?: Array<string>;
    types: Array<DocType>;
    contentOnly?: boolean;
    queryString?: string;
};

export class Search {
    private http: HttpReq<ApiQuery>;

    constructor(options: ApiConnectionOptions) {
        this.http = new HttpReq(options.apiUrl || "", options.token);
    }

    async search(query: ApiQuery) {
        return await this.http.get("search", query);
    }
}
