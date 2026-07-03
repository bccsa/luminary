import { computed, type ComputedRef, type Ref } from "vue";
import type { ContentDto, LanguageDto, Uuid } from "luminary-shared";
import { cmsLanguages, translatableLanguagesAsRef } from "@/globalConfig";
import { sortByName } from "@/util/sortByName";

export type UseContentLanguageOptions = {
    /** The route `languageCode` param as a getter (reactive). */
    languageCode: () => string | undefined;
    editableContent: Ref<ContentDto[]>;
    existingContent: Ref<ContentDto[] | undefined>;
};

export type UseContentLanguage = {
    /** Id of the translation currently being edited (derived from the route). */
    selectedLanguageId: ComputedRef<Uuid | undefined>;
    /** The selected language document. */
    selectedLanguage: ComputedRef<LanguageDto | undefined>;
    /** The editable content row for the selected language (excludes delete requests). */
    selectedContent: ComputedRef<ContentDto | undefined>;
    /** The clean (saved) content row for the selected language. */
    selectedContentExisting: ComputedRef<ContentDto | undefined>;
    /** Translatable languages that don't yet have a (non-deleted) translation. */
    untranslatedLanguages: ComputedRef<LanguageDto[]>;
};

/**
 * Derives "which translation am I editing" from the route's `languageCode` (falling
 * back to the first available CMS language) plus the editable/existing content. It is
 * read-only by design: navigation is the single source of truth for the active
 * language, so callers change it by routing, not by assignment.
 */
export function useContentLanguage(options: UseContentLanguageOptions): UseContentLanguage {
    const { languageCode, editableContent, existingContent } = options;

    const selectedLanguageId = computed<Uuid | undefined>(() => {
        if (!cmsLanguages.value.length) return undefined;
        const code = languageCode();
        if (code) {
            const preferred = cmsLanguages.value.find((l) => l.languageCode === code);
            if (preferred) return preferred._id;
        }
        return cmsLanguages.value[0]._id;
    });

    const selectedLanguage = computed<LanguageDto | undefined>(() =>
        cmsLanguages.value.find((l) => l._id === selectedLanguageId.value),
    );

    const selectedContent = computed<ContentDto | undefined>(() =>
        editableContent.value.find((c) => c.language === selectedLanguageId.value && !c.deleteReq),
    );

    const selectedContentExisting = computed<ContentDto | undefined>(() =>
        existingContent.value?.find((c) => c.language === selectedLanguageId.value && !c.deleteReq),
    );

    const untranslatedLanguages = computed<LanguageDto[]>(() =>
        translatableLanguagesAsRef.value
            .filter((l) => !editableContent.value.some((c) => c.language === l._id && !c.deleteReq))
            .sort(sortByName),
    );

    return {
        selectedLanguageId,
        selectedLanguage,
        selectedContent,
        selectedContentExisting,
        untranslatedLanguages,
    };
}
