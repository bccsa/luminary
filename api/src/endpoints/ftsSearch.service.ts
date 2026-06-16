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

/**
 * Maximum number of candidate documents fetched and scored per query. Candidates
 * are pre-ranked by `Σ idf·tf` (length-norm-free) and capped here before the full
 * BM25 + word-match pass. Filtering happens before this cap, so the cap only ever
 * drops the lowest-scoring accessible candidates.
 */
const FTS_TOP_K = 500;

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

        // status / draft filters are a CMS-only capability
        if (req.status && !cms)
            throw new HttpException(
                "'status' filter is only available with cms=true",
                HttpStatus.BAD_REQUEST,
            );

        // Step 1: query trigrams
        const trigrams = generateSearchTrigrams(req.queryString);
        if (trigrams.length === 0) return [];

        // Step 2: corpus stats → average document length
        const { docCount: N, totalTokenCount } = await this.db.ftsCorpusStats();
        if (N === 0) return [];
        const avgdl = totalTokenCount / N || 1;

        // Step 3: permission context. NOTE: accessMapToGroups returns a Map-typed value
        // that is used as a plain object via property access (see PermissionSystem).
        const userViewGroups = PermissionSystem.accessMapToGroups(userDetails.accessMap, AclPermission.View, [
            DocType.Post,
            DocType.Tag,
            DocType.Language,
        ]);

        const groupsByParentType: Record<string, Uuid[]> = {};
        for (const t of types) groupsByParentType[t] = userViewGroups[t] || [];
        if (!types.some((t) => groupsByParentType[t].length > 0))
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

        // Step 4: document frequency → drop over-common trigrams
        const df = await this.db.ftsTrigramDf(trigrams);
        const maxDocCount = Math.max(1, Math.floor((N * maxTrigramDocPercent) / 100));
        const usableTrigrams = trigrams.filter((t) => {
            const d = df.get(t) || 0;
            return d > 0 && d <= maxDocCount;
        });
        if (usableTrigrams.length === 0) return [];

        // Step 5: fetch candidate rows and filter in JS straight from the embedded metadata
        const candidates = await this.db.ftsTrigramCandidates(usableTrigrams);
        const perDocTf = new Map<string, Map<string, number>>();
        const accessibleDfDocs = new Map<string, Set<string>>(); // trigram → distinct surviving docIds

        for (const row of candidates) {
            const [tf, parentType, status, publishDate, expiryDate, language, memberOf, parentTags] =
                row.value;

            // parentType / requested types
            if (!requestedTypes.has(parentType)) continue;

            // permission: doc's groups ∩ user's View groups for this parentType
            const groups = groupsByParentType[parentType];
            if (!groups || groups.length === 0) continue;
            if (!memberOf || !memberOf.some((g) => groups.includes(g))) continue;

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
        }
        if (perDocTf.size === 0) return [];

        // IDF over the accessible/visible subset (distinct surviving docIds)
        const idfMap = new Map<string, number>();
        for (const t of usableTrigrams) {
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
        let topK = prelim;
        if (prelim.length > FTS_TOP_K) {
            this.logger.warn(
                `FTS: ${prelim.length} candidates exceed top-K (${FTS_TOP_K}); truncating to highest-scoring`,
            );
            topK = prelim.slice(0, FTS_TOP_K);
        }
        const topKIds = topK.map((c) => c.docId);

        // Step 7: fetch the top-K docs (by-key _all_docs, not Mango) → full BM25 + word-match
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
