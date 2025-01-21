import { HttpReq } from "./http";
import { ApiConnectionOptions } from "../types";

export type ApiQuery = {
    query: string;
    limit: number;
    offset: number;
    sort: string;
    filter: string;
    fields: string;
    group: string;
    type: string;
    contentOnly: boolean;
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
