import type { Uuid } from "luminary-shared";

/**
 * Get the first supported language for a content document's parent.
 * @param languages
 * @param availableLanguages
 * @returns the first supported languages
 */
export function firstLanguageSupported(languages: Uuid[], availableLanguages: Uuid[]) {
    if (!availableLanguages || !Array.isArray(availableLanguages)) return;
    return languages.find((lang) => availableLanguages.includes(lang));
}
