import { DocType, LocalChangeDto, PublishStatus } from "../types";
import { HttpReq } from "./http";
import { config } from "../config";
import { LFormData } from "../util/LFormData";
import { db } from "../db/database";
import { useDexieLiveQuery } from "../util";
import { syncLocalChanges } from "./syncLocalChanges";
import type { ApiFtsResult } from "../fts/types";

/**
 * Query for the server-side full-text search endpoint (`POST /fts`).
 * Mirrors the API's `FtsSearchReqDto`. Only `queryString` is required.
 */
export type ApiFtsQuery = {
    apiVersion?: string;
    queryString: string;
    types?: Array<DocType>;
    languages?: Array<string>;
    limit?: number;
    offset?: number;
    cms?: boolean;
    tags?: Array<string>;
    /**
     * Restrict to docs whose `memberOf` intersects these group IDs. Used by the strict aux
     * (non-Content) search; applied after permission scoping (narrows only).
     */
    groups?: Array<string>;
    status?: PublishStatus;
    publishedAfter?: number;
    publishedBefore?: number;
    /** Strict mode: require every query word (≥3 chars) as a substring of the searchable fields. */
    matchAllWords?: boolean;
    /**
     * Strict mode: order by this field/direction instead of relevance. The Content path allows
     * title/publishDate/expiryDate/updatedTimeUtc; aux doctypes allow their own fields
     * (e.g. name/email/slug/lastLogin/updatedTimeUtc), validated server-side per doctype.
     */
    sort?: {
        field:
            | "title"
            | "publishDate"
            | "expiryDate"
            | "updatedTimeUtc"
            | "name"
            | "email"
            | "slug"
            | "lastLogin";
        direction: "asc" | "desc";
    };
    bm25k1?: number;
    bm25b?: number;
    maxTrigramDocPercent?: number;
};

export type ChangeRequestQuery = {
    id: number;
    doc: any;
    apiVersion?: string;
};

export type StorageStatusQuery = {
    bucketId: string;
    apiVersion: string;
};

export type StorageStatusResponse = {
    status: "connected" | "unreachable" | "unauthorized" | "not-found" | "no-credentials";
    message?: string;
};

class RestApi {
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

        this.http = new HttpReq(config.apiUrl || "");

        const localChanges = useDexieLiveQuery(
            () => db.localChanges.toArray() as unknown as Promise<LocalChangeDto[]>,
            { initialValue: [] as unknown as LocalChangeDto[] },
        );
        syncLocalChanges(localChanges);
    }

    /**
     * Server-side full-text search (`POST /fts`). Returns `undefined` on an HTTP error
     * (4xx/5xx; 5xx also raises the `serverError` ref) and throws on a network failure.
     */
    async fts(query: ApiFtsQuery): Promise<ApiFtsResult[] | undefined> {
        query.apiVersion = "0.0.0";
        return await this.http.post("fts", query);
    }

    async changeRequest(query: ChangeRequestQuery | FormData) {
        if (query instanceof LFormData) {
            (query as LFormData).append("apiVersion", "0.0.0");
        }
        (query as ChangeRequestQuery).apiVersion = "0.0.0";
        return await this.http.post("changerequest", query);
    }

    async getStorageStatus(bucketId: string): Promise<StorageStatusResponse | undefined> {
        return await this.http.getWithQueryParams("storage/storagestatus", {
            bucketId,
            apiVersion: "0.0.0",
        });
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
