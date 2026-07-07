import { type Uuid, type MangoSelector, PublishStatus } from "luminary-shared";
import { cmsLanguageIdAsRef, cmsLanguageIdsAsRef, cmsDefaultLanguage } from "@/globalConfig";
import { sessionNow } from "@/util/sessionNow";
import type { ContentOverviewQueryOptions } from "./types";

/**
 * Builds a Mango selector that matches documents where the `language` field is the
 * first available language from the priority list. For each language at index i it
 * requires that none of the higher-priority languages (0..i-1) are in
 * `availableTranslations`; a final fallback matches any language when none of the
 * preferred ones are available.
 *
 * This is the "fill in untranslated docs" logic — for parents not translated to the
 * preferred language it surfaces the first available other-language translation.
 *
 * Ported verbatim from the app's `buildLanguagePrioritySelector`
 * (`app/src/util/mangoIsPublished.ts`) — keep the two in sync.
 */
export function buildLanguagePrioritySelector(languageIds: Uuid[]): MangoSelector {
    const validLanguageIds = languageIds.filter((id) => id != null);

    if (validLanguageIds.length === 0) {
        // No languages specified, match any document
        return {};
    }

    const languageConditions: MangoSelector[] = validLanguageIds.map((langId, index) => {
        if (index === 0) {
            // First language: just match it directly
            return { language: langId };
        }

        // For subsequent languages: match only if higher-priority languages
        // are NOT available in the translations
        const higherPriorityNotAvailable = validLanguageIds.slice(0, index).map((prevLangId) => ({
            $not: { availableTranslations: { $elemMatch: { $eq: prevLangId } } },
        }));

        return {
            $and: [{ language: langId }, ...higherPriorityNotAvailable],
        };
    });

    // Fallback: if none of the preferred languages are available,
    // return the first available translation (any language)
    const fallbackCondition: MangoSelector = {
        $and: validLanguageIds.map((langId) => ({
            $not: { availableTranslations: { $elemMatch: { $eq: langId } } },
        })),
    };

    return {
        $or: [...languageConditions, fallbackCondition],
    };
}

/**
 * The CMS's language priority order, derived from existing config (the CMS keeps its
 * single working-language model — this just expresses its fallback order as a list):
 * working language → default language → the rest. Mirrors the order documented in
 * `cms/src/util/getPreferredContentLanguage.ts`.
 */
export function cmsLanguagePriority(): Uuid[] {
    const ordered = [
        cmsLanguageIdAsRef.value,
        cmsDefaultLanguage.value?._id,
        ...cmsLanguageIdsAsRef.value,
    ].filter((id): id is Uuid => !!id);
    return [...new Set(ordered)];
}

/**
 * Language/translation clause for the browse selector.
 * - `translated` → exact selected-language match (no fallback).
 * - `all` / `untranslated` → the priority-fallback set. (`untranslated` is further
 *   narrowed client-side — see {@link isUntranslatedRow} — since "parent has no
 *   selected-language translation" is a cross-doc condition.)
 */
export function translationStatusSelector(
    translationStatus: ContentOverviewQueryOptions["translationStatus"],
    languageId: Uuid,
): MangoSelector {
    if (translationStatus === "translated") return { language: languageId };
    return buildLanguagePrioritySelector(cmsLanguagePriority());
}

/**
 * Client-side predicate for the `untranslated` filter: keep only rows that are NOT
 * the selected-language translation of their parent. The priority selector returns,
 * for untranslated parents, the first other-language doc (whose `availableTranslations`
 * never includes the selected language); selected-language rows are dropped here.
 */
export function isUntranslatedRow(
    doc: { language: Uuid; availableTranslations?: Uuid[] },
    languageId: Uuid,
): boolean {
    return doc.language !== languageId && !(doc.availableTranslations ?? []).includes(languageId);
}

/**
 * Publish-status Mango clauses (to be AND-ed). Mirrors the old `publishStatusFilter`
 * in `content/query.ts`, expressed against a frozen session "now" so the selector
 * stays byte-stable for HybridQuery dedup (see {@link sessionNow}).
 * Returns `[]` for `"all"` (no narrowing). Note: `scheduled`/`expired` are computed
 * states, not stored statuses, so they're derived from publish/expiry date bounds.
 */
export function publishStatusSelector(
    publishStatus: ContentOverviewQueryOptions["publishStatus"],
): MangoSelector[] {
    if (!publishStatus || publishStatus === "all") return [];
    const now = sessionNow();

    if (publishStatus === "draft") return [{ status: PublishStatus.Draft }];

    if (publishStatus === "published")
        return [
            { status: PublishStatus.Published },
            { publishDate: { $lte: now } },
            {
                $or: [
                    { expiryDate: { $exists: false } },
                    { expiryDate: null },
                    { expiryDate: { $gt: now } },
                ],
            },
        ];

    if (publishStatus === "scheduled")
        return [{ status: PublishStatus.Published }, { publishDate: { $gt: now } }];

    // expired
    return [{ status: PublishStatus.Published }, { expiryDate: { $lte: now } }];
}

/**
 * Mango clauses (to be AND-ed) for the user-selectable publish/expiry date-range filters.
 * Independent of {@link publishStatusSelector} — narrows further on top of whichever
 * `publishStatus` is selected. Each bound is optional and only narrows when present.
 */
export function dateRangeSelector(
    o: Pick<
        ContentOverviewQueryOptions,
        "publishedAfter" | "publishedBefore" | "expiresAfter" | "expiresBefore"
    >,
): MangoSelector[] {
    const clauses: MangoSelector[] = [];
    if (o.publishedAfter != null) clauses.push({ publishDate: { $gte: o.publishedAfter } });
    if (o.publishedBefore != null) clauses.push({ publishDate: { $lte: o.publishedBefore } });
    if (o.expiresAfter != null) clauses.push({ expiryDate: { $gte: o.expiresAfter } });
    if (o.expiresBefore != null) clauses.push({ expiryDate: { $lte: o.expiresBefore } });
    return clauses;
}
