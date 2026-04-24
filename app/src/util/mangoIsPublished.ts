import { type Uuid, type MangoSelector, PublishStatus } from "luminary-shared";

export type MangoIsPublishedOptions = {
    /**
     * When true, also matches scheduled content: `publishDate` in the future is allowed
     * if `parentShowComingSoon === true` (for list/carousel "Coming soon" tiles).
     * Default false: publishDate must be missing, null, or <= now.
     */
    includeScheduled?: boolean;
};

/**
 * Builds Mango selector conditions for the "isPublished" check.
 * This can be used to inject the publication status, date, and language priority logic into a Mango query.
 *
 * The conditions check:
 * 1. status === "published"
 * 2. publishDate: by default missing, null, or <= now; with `includeScheduled`, also future dates when `parentShowComingSoon`
 * 3. expiryDate is either missing, null, or >= now (not expired)
 * 4. language matches the first available language from the user's preferences
 *
 * @param languageIds - Array of language IDs in priority order (most preferred first)
 * @param options - Optional `includeScheduled` for upcoming/coming-soon display in feeds
 * @returns Array of Mango selector conditions to be used in an $and clause
 *
 * @example
 * ```ts
 * const selector = {
 *     $and: [
 *         { type: DocType.Content },
 *         ...mangoIsPublished(appLanguageIds),
 *     ],
 * };
 * ```
 */
export function mangoIsPublished(languageIds: Uuid[], options?: MangoIsPublishedOptions): MangoSelector[] {
    const now = Date.now();
    const includeScheduled = options?.includeScheduled === true;

    const publishDateSelector: MangoSelector = includeScheduled
        ? {
              // Either already published OR scheduled with the parent "coming soon" flag
              $or: [{ publishDate: { $lte: now } }, { parentShowComingSoon: true }],
          }
        : {
              // Publish date: missing/null = considered published; otherwise must be <= now
              $or: [
                  { publishDate: { $exists: false } },
                  { publishDate: null },
                  { publishDate: { $lte: now } },
              ],
          };

    return [
        // Draft documents are synced to app clients (for future preview functionality),
        // so we must filter to only show published content in regular views.
        { status: PublishStatus.Published },
        publishDateSelector,
        // Expiry date check: either doesn't exist, is null, or is in the future
        {
            $or: [
                { expiryDate: { $exists: false } },
                { expiryDate: null },
                { expiryDate: { $gte: now } },
            ],
        },

        // Language priority: select the best available translation
        buildLanguagePrioritySelector(languageIds),
    ];
}

/**
 * Builds a Mango selector that matches documents where the language field
 * is the first available language from the priority list.
 *
 * For each language at index i, it checks that none of the higher-priority
 * languages (0 to i-1) are in availableTranslations.
 *
 * @param languageIds - Array of language IDs in priority order
 * @returns Mango selector for language priority matching
 */
function buildLanguagePrioritySelector(languageIds: Uuid[]): MangoSelector {
    // Filter out undefined/null values that might occur if array is shorter than expected
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
