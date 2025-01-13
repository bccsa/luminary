import { appLanguageIdsAsRef } from "@/globalConfig";
import { type ContentDto, type Uuid } from "luminary-shared";

/**
 * Check if a content item is published
 * @param content - The content document item to check
 * @param languageIds - The language ids to check against
 * @returns
 */
export function isPublished(content: ContentDto, languageIds: Uuid[]): boolean {
    const firstSupportedLang = languageIds.find((lang) =>
        content.availableTranslations?.includes(lang),
    );
    if (
        !content ||
        content.status !== "published" ||
        !content.publishDate ||
        content.publishDate > Date.now() ||
        (content.expiryDate && content.expiryDate < Date.now()) ||
        firstSupportedLang !== content.language
    ) {
        return false;
    }

    return true;
}
