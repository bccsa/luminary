import { getRest } from "../api/RestApi";
import { config, getContentPublishDateCutoff } from "../config";
import { isConnected } from "../socket/socketio";
import { OPEN_MIN } from "../api/sync/utils";
import type { ContentDto } from "../types";
import type { FtsSearchOptions, FtsSearchResult } from "./types";

/**
 * Decide whether a full-text search should run against the server-side `/fts`
 * endpoint instead of the local offline index.
 *
 * - Offline → local.
 * - Online + a `publishDate` sync cutoff is set (selective sync, app) → API, because
 *   local holds only the recent subset.
 * - Online + CMS → API, because the CMS wants authoritative full-corpus results and
 *   index-backed filtering even though it has no cutoff.
 * - Online + full sync (no cutoff, not CMS) → local, since every doc is available locally.
 */
export function shouldUseApiFts(): boolean {
    return isConnected.value && (!!config?.cms || getContentPublishDateCutoff() !== OPEN_MIN);
}

/**
 * Run a full-text search against the server-side `/fts` endpoint and normalize the
 * response to {@link FtsSearchResult} (with `source: "api"`) so consumers don't care
 * about the source.
 *
 * Throws when the request fails (HTTP 4xx/5xx → `undefined` response, or a network
 * error) so the caller can distinguish a failure (→ fall back to local) from a
 * legitimately-empty result set.
 *
 * The returned `doc`s are trimmed of the FTS index fields (`fts`/`ftsTokenCount`) and
 * are display-only — they must never be persisted to Dexie (ADR 0010).
 */
export async function ftsSearchApi(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    const res = await getRest().fts({
        queryString: options.query,
        languages: options.languageId ? [options.languageId] : undefined,
        limit: options.limit,
        offset: options.offset,
        cms: config.cms,
        maxTrigramDocPercent: options.maxTrigramDocPercent,
        bm25k1: options.bm25k1,
        bm25b: options.bm25b,
    });

    // `undefined` means the HTTP layer swallowed a 4xx/5xx; treat as a failure so the
    // router falls back to local rather than showing an empty (but "complete") result.
    if (res === undefined) throw new Error("FTS API request failed");

    return res.map((r) => ({
        docId: r.docId,
        score: r.score,
        wordMatchScore: r.wordMatchScore,
        doc: r.doc as ContentDto,
        source: "api" as const,
    }));
}
