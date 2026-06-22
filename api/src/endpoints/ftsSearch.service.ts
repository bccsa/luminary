import { Injectable, Inject, HttpException, HttpStatus } from "@nestjs/common";
import { DbService } from "../db/db.service";
import { AclPermission, DocType, PublishStatus, Uuid } from "../enums";
import { PermissionSystem } from "../permissions/permissions.service";
import { WINSTON_MODULE_PROVIDER } from "nest-winston";
import { Logger } from "winston";
import { JwtUserDetails } from "../auth/authIdentity.service";
import { LanguageDto } from "../dto/LanguageDto";
import { ContentDto } from "../dto/ContentDto";
import { FtsSearchReqDto } from "../dto/FtsSearchReqDto";
import { FtsSearchResultDto } from "../dto/FtsSearchResultDto";
import {
    FTS_BM25_B,
    FTS_BM25_K1,
    FTS_DEFAULT_LIMIT,
    FTS_MAX_TRIGRAM_DOC_PERCENT,
    bm25Score,
    generateSearchTrigrams,
    idf,
    queryWords,
    wordMatchScore,
} from "../util/ftsScoring";
import { normalizeText } from "../util/ftsIndexing";

/** Document fields a strict (sorted) Content FTS search may order by. */
const FTS_SORT_FIELDS = new Set(["title", "publishDate", "expiryDate", "updatedTimeUtc"]);

/**
 * Per-doctype config for the strict-only *aux* FTS path (non-Content doctypes such as User
 * and Redirect). Each has its own trigram view emitting a named metadata object; the path
 * does substring-AND on {@link AuxFtsConfig.matchFields} + field sort + permission/group
 * filtering, with no BM25/relevance.
 */
type AuxFtsConfig = {
    docType: DocType;
    /** CouchDB trigram view (== design-doc id) for this doctype. */
    viewName: string;
    /** Metadata fields the query is substring-AND matched against. */
    matchFields: string[];
    /** Allowlisted sort fields for this doctype. */
    sortFields: Set<string>;
    /** Used when the request omits a valid sort. */
    defaultSort: { field: string; direction: "asc" | "desc" };
};

const AUX_FTS_CONFIG: Partial<Record<DocType, AuxFtsConfig>> = {
    [DocType.User]: {
        docType: DocType.User,
        viewName: "fts-trigram-index-user",
        matchFields: ["name", "email"],
        sortFields: new Set(["name", "email", "updatedTimeUtc", "lastLogin"]),
        defaultSort: { field: "name", direction: "asc" },
    },
    [DocType.Redirect]: {
        docType: DocType.Redirect,
        viewName: "fts-trigram-index-redirect",
        matchFields: ["slug", "toSlug"],
        sortFields: new Set(["slug", "updatedTimeUtc"]),
        defaultSort: { field: "updatedTimeUtc", direction: "desc" },
    },
};

/** Doc-level metadata captured for the strict path (substring match + field sort). */
type StrictMeta = {
    title: string | null;
    author: string | null;
    publishDate: number | null;
    expiryDate: number | null;
    updatedTimeUtc: number | null;
};

/**
 * Minimum number of candidate documents fetched and exact-scored per query. The
 * effective cap is `max(FTS_TOP_K_MIN, offset + limit)` so deep pages still work.
 * Candidates are pre-ranked by `Σ idf·tf` (length-norm-free, strongly correlated with
 * final BM25) and capped before the full BM25 + word-match pass; filtering happens
 * before the cap, so it only ever drops the lowest-scoring accessible candidates.
 * Kept modest because each fetched doc carries its large `fts` array (stripped before
 * returning) — a smaller K means a much smaller `_all_docs` fetch.
 */
const FTS_TOP_K_MIN = 150;

/**
 * High-df trigram pruning. After dropping over-common trigrams (`maxTrigramDocPercent`),
 * keep only the most discriminative (lowest-df) remaining trigrams within a candidate-row
 * budget — the number of candidate rows a trigram contributes is ≈ its document frequency.
 * Common trigrams add many rows but little ranking signal (low IDF), so dropping them
 * shrinks the candidate scan and the JS filter loop with minimal ranking impact.
 *
 * `FTS_CANDIDATE_ROW_BUDGET` caps the summed df of kept trigrams (≈ candidate rows fetched).
 * `FTS_MIN_TRIGRAMS` is a floor: always keep at least this many of the rarest trigrams even
 * if that exceeds the budget, so short/uncommon queries still match.
 */
const FTS_CANDIDATE_ROW_BUDGET = 3000;
const FTS_MIN_TRIGRAMS = 3;

/**
 * Server-side full-text search.
 *
 * Reproduces the offline (client-side) trigram + BM25 ranking from
 * `shared/src/fts/ftsSearch.ts` against the full corpus, enforcing the user's view
 * permissions and (on the non-CMS path) published/scheduled/expired/language
 * visibility. See ADR 0010.
 */
@Injectable()
export class FtsSearchService {
    /** In-memory languages cache for the accessible-language filter (mirrors QueryService). */
    private languages: LanguageDto[] = [];

    constructor(
        @Inject(WINSTON_MODULE_PROVIDER)
        private readonly logger: Logger,
        private db: DbService,
    ) {
        this.db.on("languageUpdate", (doc) => {
            if (doc.type === DocType.Language) {
                const i = this.languages.findIndex((l) => l._id == doc._id);
                if (i >= 0) this.languages[i] = doc;
                else this.languages.push(doc);
            } else if (doc.type === DocType.DeleteCmd) {
                const i = this.languages.findIndex((l) => l._id == doc._id);
                if (i >= 0) this.languages.splice(i, 1);
            }
        });

        // Drop the cache on disconnect so changes missed during the outage don't linger.
        this.db.on("disconnect", () => {
            this.languages = [];
        });
        this.db.on("reconnect", () => {
            this.loadLanguages();
        });

        this.loadLanguages();
    }

    private loadLanguages() {
        this.db
            .executeFindQuery({
                selector: { type: DocType.Language },
                limit: Number.MAX_SAFE_INTEGER,
                use_index: "sync-language-index",
            })
            .then((res) => {
                // Merge by _id so concurrent change-stream updates aren't clobbered (see QueryService).
                for (const doc of res.docs as LanguageDto[]) {
                    const i = this.languages.findIndex((l) => l._id == doc._id);
                    if (i >= 0) this.languages[i] = doc;
                    else this.languages.push(doc);
                }
            })
            .catch((err) => {
                this.logger.error("Failed to load languages cache", err);
            });
    }

    async search(req: FtsSearchReqDto, userDetails: JwtUserDetails): Promise<FtsSearchResultDto[]> {
        const now = Date.now();
        const cms = req.cms === true;
        const limit = req.limit && req.limit > 0 ? req.limit : FTS_DEFAULT_LIMIT;
        const offset = req.offset && req.offset > 0 ? req.offset : 0;
        const k1 = req.bm25k1 ?? FTS_BM25_K1;
        const b = req.bm25b ?? FTS_BM25_B;
        const maxTrigramDocPercent = req.maxTrigramDocPercent ?? FTS_MAX_TRIGRAM_DOC_PERCENT;
        const types = req.types && req.types.length ? req.types : [DocType.Post, DocType.Tag];

        // Aux (non-Content) FTS: a single non-Content doctype with its own trigram view and a
        // strict-only path (substring + sort + group/permission filters; no BM25). Routed
        // before the Content-specific setup below, which assumes Post/Tag/Content metadata.
        if (types.length === 1) {
            const auxConfig = AUX_FTS_CONFIG[types[0]];
            if (auxConfig) return this.searchAux(req, userDetails, auxConfig);
        }

        // status / draft filters are a CMS-only capability
        if (req.status && !cms)
            throw new HttpException(
                "'status' filter is only available with cms=true",
                HttpStatus.BAD_REQUEST,
            );

        // Strict mode: substring AND on title/author + order by a document field, instead
        // of fuzzy BM25 relevance. Validate the sort field against the allowlist.
        let sortSpec: { field: string; direction: "asc" | "desc" } | undefined;
        if (req.sort) {
            if (
                !FTS_SORT_FIELDS.has(req.sort.field) ||
                (req.sort.direction !== "asc" && req.sort.direction !== "desc")
            )
                throw new HttpException("invalid 'sort'", HttpStatus.BAD_REQUEST);
            sortSpec = req.sort;
        }
        const strict = req.matchAllWords === true || sortSpec != null;

        // Step 1: query trigrams
        const trigrams = generateSearchTrigrams(req.queryString);
        if (trigrams.length === 0) return [];

        // Step 2: permission context (in-memory). NOTE: accessMapToGroups returns a
        // Map-typed value that is used as a plain object via property access.
        const userViewGroups = PermissionSystem.accessMapToGroups(userDetails.accessMap, AclPermission.View, [
            DocType.Post,
            DocType.Tag,
            DocType.Language,
        ]);

        // Per-parentType View groups as Sets for O(1) membership checks in the hot filter loop.
        const groupsByParentType: Record<string, Set<Uuid>> = {};
        for (const t of types) groupsByParentType[t] = new Set(userViewGroups[t] || []);
        if (!types.some((t) => groupsByParentType[t].size > 0))
            throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

        // Accessible languages (visibility filter on the non-CMS path)
        const langViewGroups = userViewGroups[DocType.Language] || [];
        const accessibleLanguages = new Set(
            this.languages
                .filter((lang) => (lang.memberOf as Uuid[]).some((g) => langViewGroups.includes(g)))
                .map((lang) => lang._id),
        );
        if (!cms && accessibleLanguages.size === 0)
            throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

        // Optional request filters
        const requestedTypes = new Set<string>(types);
        const requestedLanguages =
            req.languages && req.languages.length ? new Set(req.languages) : null;
        const requestedTags = req.tags && req.tags.length ? new Set(req.tags) : null;

        // Step 3: corpus stats + document frequency — independent reads, run in parallel.
        const [{ docCount: N, totalTokenCount }, df] = await Promise.all([
            this.db.ftsCorpusStats(),
            this.db.ftsTrigramDf(trigrams),
        ]);
        if (N === 0) return [];
        const avgdl = totalTokenCount / N || 1;

        // Drop over-common trigrams
        const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));
        const usableTrigrams = trigrams.filter((t) => {
            const d = df.get(t) || 0;
            return d > 0 && d <= maxDocCount;
        });
        if (usableTrigrams.length === 0) return [];

        // High-df pruning: keep the most discriminative (lowest-df) trigrams within a
        // candidate-row budget. Sort rarest-first and greedily add until the summed df
        // would exceed the budget (but always keep at least FTS_MIN_TRIGRAMS).
        const rankedByDf = usableTrigrams
            .map((t) => ({ t, d: df.get(t) || 0 }))
            .sort((a, b2) => a.d - b2.d);
        let rowBudget = 0;
        const keptTrigrams: string[] = [];
        for (const { t, d } of rankedByDf) {
            if (
                keptTrigrams.length >= FTS_MIN_TRIGRAMS &&
                rowBudget + d > FTS_CANDIDATE_ROW_BUDGET
            )
                break;
            keptTrigrams.push(t);
            rowBudget += d;
        }

        // Step 4: fetch candidate rows and filter in JS straight from the embedded metadata
        const candidates = await this.db.ftsTrigramCandidates(keptTrigrams);
        const perDocTf = new Map<string, Map<string, number>>();
        const accessibleDfDocs = new Map<string, Set<string>>(); // trigram → distinct surviving docIds
        // Doc-level metadata for the strict path (captured once per surviving doc).
        const perDocMeta = new Map<string, StrictMeta>();

        for (const row of candidates) {
            const [
                tf,
                parentType,
                status,
                publishDate,
                expiryDate,
                language,
                memberOf,
                parentTags,
                updatedTimeUtc,
                title,
                author,
            ] = row.value;

            // parentType / requested types
            if (!requestedTypes.has(parentType)) continue;

            // permission: doc's groups ∩ user's View groups for this parentType
            const groups = groupsByParentType[parentType];
            if (!groups || groups.size === 0) continue;
            if (!memberOf || !memberOf.some((g) => groups.has(g))) continue;

            // visibility (non-CMS): published, not scheduled, not expired, accessible language
            if (!cms) {
                if (status !== PublishStatus.Published) continue;
                if (publishDate == null || publishDate > now) continue;
                if (expiryDate != null && expiryDate <= now) continue;
                if (!accessibleLanguages.has(language)) continue;
            }

            // optional request filters (each applied only when present)
            if (requestedLanguages && !requestedLanguages.has(language)) continue;
            if (cms && req.status && status !== req.status) continue;
            if (requestedTags && !(parentTags || []).some((tg) => requestedTags.has(tg))) continue;
            if (req.publishedAfter != null && (publishDate == null || publishDate < req.publishedAfter))
                continue;
            if (
                req.publishedBefore != null &&
                (publishDate == null || publishDate > req.publishedBefore)
            )
                continue;

            // survivor → record tf and accessible df
            let tfMap = perDocTf.get(row.docId);
            if (!tfMap) {
                tfMap = new Map();
                perDocTf.set(row.docId, tfMap);
            }
            tfMap.set(row.trigram, tf);

            let dfSet = accessibleDfDocs.get(row.trigram);
            if (!dfSet) {
                dfSet = new Set();
                accessibleDfDocs.set(row.trigram, dfSet);
            }
            dfSet.add(row.docId);

            // Capture doc-level metadata once (strict path: substring match + field sort).
            if (strict && !perDocMeta.has(row.docId)) {
                perDocMeta.set(row.docId, {
                    title,
                    author,
                    publishDate,
                    expiryDate,
                    updatedTimeUtc,
                });
            }
        }
        if (perDocTf.size === 0) return [];

        // ---- Strict path: substring AND on title/author + field sort, over the full
        // matched set (no top-K, no BM25). Candidate gen already used the rarest-trigram
        // pruning, so matching docs are surfaced; the substring check is the precise filter.
        if (strict) {
            const words = queryWords(req.queryString);
            const matched: Array<{ docId: string; meta: StrictMeta }> = [];
            for (const [docId, meta] of perDocMeta) {
                if (req.matchAllWords) {
                    const title = normalizeText(meta.title ?? "");
                    const author = normalizeText(meta.author ?? "");
                    if (!words.every((w) => title.includes(w) || author.includes(w))) continue;
                }
                matched.push({ docId, meta });
            }
            if (sortSpec) sortStrict(matched, sortSpec.field, sortSpec.direction);
            const pageIds = matched.slice(offset, offset + limit).map((m) => m.docId);
            if (pageIds.length === 0) return [];

            const fetched = await this.db.getDocs(pageIds, [DocType.Content]);
            const docMap = new Map<string, ContentDto>(
                (fetched.docs as ContentDto[]).map((d) => [d._id, d]),
            );
            return pageIds
                .map((id) => docMap.get(id))
                .filter((d): d is ContentDto => !!d)
                .map((doc) => ({
                    docId: doc._id,
                    score: 0,
                    wordMatchScore: 0,
                    doc: stripFtsFields(doc),
                }));
        }

        // IDF over the accessible/visible subset (distinct surviving docIds)
        const idfMap = new Map<string, number>();
        for (const t of keptTrigrams) {
            const adf = accessibleDfDocs.get(t)?.size || 0;
            if (adf > 0) idfMap.set(t, idf(N, adf));
        }

        // Step 6: pre-rank by Σ idf·tf (length-norm-free proxy), cap to top-K
        const prelim: Array<{ docId: string; proxy: number }> = [];
        for (const [docId, tfMap] of perDocTf) {
            let proxy = 0;
            for (const [t, tf] of tfMap) {
                const i = idfMap.get(t);
                if (i) proxy += i * tf;
            }
            prelim.push({ docId, proxy });
        }
        prelim.sort((a, b2) => b2.proxy - a.proxy);
        // Effective cap honors pagination depth but stays small otherwise, since each
        // fetched doc drags its large `fts` array.
        const topKCap = Math.max(FTS_TOP_K_MIN, offset + limit);
        let topK = prelim;
        if (prelim.length > topKCap) {
            topK = prelim.slice(0, topKCap);
        }
        const topKIds = topK.map((c) => c.docId);

        // Step 7: fetch the top-K docs for the full BM25 + word-match pass and the
        // returned doc body.
        // NOTE: use `_all_docs` by keys (getDocs), NOT a Mango `_find` with `_id: {$in}`.
        // Mango `$in` on `_id` range-scans the primary index between the min/max id in
        // the set — with random UUIDs that scans most of the DB and is ~6x slower.
        // `_all_docs` does direct point lookups. The `fts` array is stripped from the
        // response anyway (stripFtsFields), so the client payload is lean regardless.
        const fetched = await this.db.getDocs(topKIds, [DocType.Content]);
        const docMap = new Map<string, ContentDto>(
            (fetched.docs as ContentDto[]).map((d) => [d._id, d]),
        );
        const words = queryWords(req.queryString);

        const scored: Array<{
            docId: string;
            score: number;
            wordMatchScore: number;
            doc: ContentDto;
        }> = [];
        for (const docId of topKIds) {
            const doc = docMap.get(docId);
            if (!doc) continue;
            const tfMap = perDocTf.get(docId)!;
            const wm = wordMatchScore(words, doc as Record<string, any>);
            const score = bm25Score(tfMap, doc.ftsTokenCount || 1, idfMap, avgdl, k1, b) + wm;
            scored.push({ docId, score, wordMatchScore: wm, doc });
        }

        scored.sort((a, b2) => {
            if (Math.abs(b2.score - a.score) > 0.001) return b2.score - a.score;
            return b2.wordMatchScore - a.wordMatchScore;
        });

        // Step 8: paginate and trim the FTS index fields before returning
        return scored.slice(offset, offset + limit).map((r) => ({
            docId: r.docId,
            score: r.score,
            wordMatchScore: r.wordMatchScore,
            doc: stripFtsFields(r.doc),
        }));
    }

    /**
     * Strict-only FTS for an aux (non-Content) doctype: substring-AND on the doctype's
     * searchable fields + field sort + permission/group filtering, with no BM25/relevance.
     * Reads per-doc metadata from the doctype's trigram view (no doc loads) until the page is
     * sliced, then fetches only that page's bodies. See {@link AUX_FTS_CONFIG}.
     */
    private async searchAux(
        req: FtsSearchReqDto,
        userDetails: JwtUserDetails,
        cfg: AuxFtsConfig,
    ): Promise<FtsSearchResultDto[]> {
        const limit = req.limit && req.limit > 0 ? req.limit : FTS_DEFAULT_LIMIT;
        const offset = req.offset && req.offset > 0 ? req.offset : 0;

        // Sort: validate against this doctype's allowlist; default when unset/omitted.
        let sortSpec = cfg.defaultSort;
        if (req.sort) {
            if (
                !cfg.sortFields.has(req.sort.field) ||
                (req.sort.direction !== "asc" && req.sort.direction !== "desc")
            )
                throw new HttpException("invalid 'sort'", HttpStatus.BAD_REQUEST);
            sortSpec = req.sort;
        }

        // Query trigrams (≥3-char words only). Nothing usable ⇒ no matches.
        const trigrams = generateSearchTrigrams(req.queryString);
        if (trigrams.length === 0) return [];

        // Permission: View groups for this doctype only.
        const viewGroups = PermissionSystem.accessMapToGroups(
            userDetails.accessMap,
            AclPermission.View,
            [cfg.docType],
        );
        const groups = new Set<Uuid>(viewGroups[cfg.docType] || []);
        if (groups.size === 0) throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);

        // Explicit UI group filter (narrows within the permitted set).
        const requestedGroups = req.groups && req.groups.length ? new Set(req.groups) : null;

        // Document frequency → keep the rarest (most discriminative) trigrams within the
        // candidate-row budget. No over-common (maxTrigramDocPercent) cut: these corpora are
        // small, the substring check below is the precise filter, and there are no aux corpus
        // stats to derive a percentage from.
        const df = await this.db.ftsAuxTrigramDf(cfg.viewName, trigrams);
        const usableTrigrams = trigrams.filter((t) => (df.get(t) || 0) > 0);
        if (usableTrigrams.length === 0) return [];
        const rankedByDf = usableTrigrams
            .map((t) => ({ t, d: df.get(t) || 0 }))
            .sort((a, b) => a.d - b.d);
        let rowBudget = 0;
        const keptTrigrams: string[] = [];
        for (const { t, d } of rankedByDf) {
            if (keptTrigrams.length >= FTS_MIN_TRIGRAMS && rowBudget + d > FTS_CANDIDATE_ROW_BUDGET)
                break;
            keptTrigrams.push(t);
            rowBudget += d;
        }

        // Candidate rows → first metadata per accessible doc (permission ∩ memberOf, then the
        // explicit UI group filter). Metadata is read straight from the embedded view value.
        const candidates = await this.db.ftsAuxTrigramCandidates<Record<string, any>>(
            cfg.viewName,
            keptTrigrams,
        );
        const perDocMeta = new Map<string, Record<string, any>>();
        for (const row of candidates) {
            if (perDocMeta.has(row.docId)) continue;
            const meta = row.value;
            const memberOf: Uuid[] = meta.memberOf || [];
            if (!memberOf.some((g) => groups.has(g))) continue; // permission
            if (requestedGroups && !memberOf.some((g) => requestedGroups.has(g))) continue; // UI filter
            perDocMeta.set(row.docId, meta);
        }
        if (perDocMeta.size === 0) return [];

        // Strict substring AND over the doctype's searchable fields (aux is always strict).
        const words = queryWords(req.queryString);
        const matched: Array<{ docId: string; meta: Record<string, any> }> = [];
        for (const [docId, meta] of perDocMeta) {
            const ok = words.every((w) =>
                cfg.matchFields.some((f) => normalizeText(meta[f] ?? "").includes(w)),
            );
            if (ok) matched.push({ docId, meta });
        }
        if (matched.length === 0) return [];

        // Sort the full matched set, then paginate.
        sortStrict(matched, sortSpec.field, sortSpec.direction);
        const pageIds = matched.slice(offset, offset + limit).map((m) => m.docId);
        if (pageIds.length === 0) return [];

        // Fetch only the page's docs for the body; strip the server-only fts index field.
        const fetched = await this.db.getDocs(pageIds, [cfg.docType]);
        const docMap = new Map<string, Record<string, any>>(
            (fetched.docs as Record<string, any>[]).map((d) => [d._id, d]),
        );
        return pageIds
            .map((id) => docMap.get(id))
            .filter((d): d is Record<string, any> => !!d)
            .map((doc) => ({
                docId: doc._id,
                score: 0,
                wordMatchScore: 0,
                doc: stripAuxFtsFields(doc) as Partial<ContentDto>,
            }));
    }
}

/**
 * Remove the server-only FTS index fields from a content document before sending
 * it to clients. These docs are display-only and must not be persisted on device
 * (see {@link FtsSearchResultDto}).
 */
function stripFtsFields(doc: ContentDto): Partial<ContentDto> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fts, ftsTokenCount, ...rest } = doc as Record<string, any>;
    return rest as Partial<ContentDto>;
}

/**
 * Remove the server-only `fts` index field from an aux-doctype (User/Redirect) document
 * before returning it. Display-only; clients must not persist it — it would otherwise pollute
 * the offline Content FTS index. (Aux docs have no `ftsTokenCount`.)
 */
function stripAuxFtsFields(doc: Record<string, any>): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { fts, ...rest } = doc;
    return rest;
}

/**
 * Order strict-mode matches in place by a metadata field (Content or aux doctype). Missing/
 * null values sort last (both directions); ties break by `docId`; strings compare
 * case-insensitively. Kept identical to the client's `sortByField`
 * (`shared/src/fts/ftsSearch.ts`) so a partially-synced client gets the same order whether a
 * search routes local or to this endpoint.
 */
function sortStrict(
    arr: Array<{ docId: string; meta: Record<string, any> }>,
    field: string,
    direction: "asc" | "desc",
): void {
    const dir = direction === "asc" ? 1 : -1;
    const norm = (v: unknown): any => (typeof v === "string" ? v.toLowerCase() : v);
    arr.sort((a, b) => {
        const av = norm(a.meta[field]);
        const bv = norm(b.meta[field]);
        const an = av == null;
        const bn = bv == null;
        if (an || bn) {
            if (an && bn) return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
            return an ? 1 : -1; // nulls last, regardless of direction
        }
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return a.docId < b.docId ? -1 : a.docId > b.docId ? 1 : 0;
    });
}
