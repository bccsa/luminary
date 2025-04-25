import { cmsDefaultLanguage, cmsLanguageIdAsRef } from "@/globalConfig";
import type { Uuid } from "luminary-shared";

/**
 * Get the first supported language for a content document's parent.
 * Order of preference: preferred language (if set, else cms selected language), default language, first language in the list.
 * @param languages
 * @returns the first supported languages
 */
export function getPreferredContentLanguage(languages: Uuid[], preferredLanguage?: Uuid) {
    if (languages.length === 0) return undefined;

    if (languages.some((lang) => lang === preferredLanguage)) return preferredLanguage;
    if (languages.some((lang) => lang === cmsLanguageIdAsRef.value))
        return cmsLanguageIdAsRef.value;
    if (languages.some((lang) => lang === cmsDefaultLanguage.value?._id))
        return cmsDefaultLanguage.value?._id;

    return languages[0];
}
