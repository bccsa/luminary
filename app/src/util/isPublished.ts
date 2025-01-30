import { type ContentDto, type Uuid } from "luminary-shared";
import { firstLanguageSupported } from "./firstSupportedLanguage";

/**
 * Check if a content item is published
 * @param content - The content document item to check
 * @param languageIds - The language ids to check against
 * @returns
 */
export function isPublished(content: ContentDto, languageIds: Uuid[]): boolean {
    if (!content.availableTranslations) return false;
    const firstSupportedLang = firstLanguageSupported(languageIds, content.availableTranslations);

    if (!content) return false;
    if (!content.publishDate) return false;
    if (content.publishDate > Date.now()) return false;
    if (content.status !== "published") return false;
    if (content.expiryDate && content.expiryDate < Date.now()) return false;
    if (firstSupportedLang !== content.language) return false;

    return true;
}
