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
    expiresAfter?: number;
    expiresBefore?: number;
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

/**
 * The bucket's S3 credentials and public base URL, shaped for the local media
 * encoder's session request so it can be forwarded without reshaping.
 */
export type EncoderConfigResponse = {
    s3: {
        endPoint: string;
        port: number;
        useSSL: boolean;
        bucket: string;
        accessKey: string;
        secretKey: string;
    };
    publicBaseUrl: string;
};

/**
 * A sidecar payload for one (parent, sidecarType) pair. `data`'s shape depends on
 * `sidecarType` — for `"hlsEncryptionKey"` it is `{ maskedKeyHex: string }`, masked
 * against `sidecarId` (self-inverse XOR, see `unmaskKeyHex`).
 */
export type SidecarResponse = {
    sidecarId: string;
    parentId: string;
    sidecarType: string;
    data: unknown;
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

    /**
     * A sidecar payload for one parent document, one sidecar type at a time (no
     * batching — see the API's `SidecarController`).
     *
     * Sidecars carry data that must never replicate to every client, such as an
     * HLS decryption key: documents hold only an id (`hlsKey_id`), and the payload
     * is fetched from here instead. The server hands it to anyone who may view the
     * parent and to nobody else; `cms: true` asks under `CmsView` instead of
     * `View`, for an editor previewing a parent that has no live content yet.
     *
     * `undefined` covers "no such sidecar" and "you may not see it" alike — both
     * are simply "there is nothing to use" from the caller's side.
     */
    async getSidecar(
        parentId: string,
        sidecarType: string,
        opts: { cms?: boolean } = {},
    ): Promise<SidecarResponse | undefined> {
        return await this.http.getWithQueryParams("sidecar", {
            parentId,
            sidecarType,
            ...(opts.cms ? { cms: "true" } : {}),
            apiVersion: "0.0.0",
        });
    }

    /**
     * Fetch the encode destination for a media bucket. Requires Assign permission on
     * the bucket, since the response carries credentials that can write to it.
     */
    async getEncoderConfig(bucketId: string): Promise<EncoderConfigResponse | undefined> {
        return await this.http.getWithQueryParams("storage/encoderconfig", {
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
