import { computed, onMounted, ref, watch, type Ref } from "vue";
import type { ContentDto, LanguageDto } from "luminary-shared";
import type { Router } from "vue-router";
import { useNotificationStore } from "@/stores/notification";
import { isExternalNavigation } from "@/router";
import { appLanguageAsRef } from "@/globalConfig";

type TranslationSwitcherOptions = {
    content: Ref<ContentDto | undefined>;
    contentOverride: Ref<ContentDto | undefined>;
    translations: Ref<ContentDto[]>;
    languages: Ref<LanguageDto[]>;
    preferredLanguageId: Ref<string | undefined>;
    forcedLanguageCode: string | null;
    router: Router;
    translate: (key: string, params?: Record<string, unknown>) => string;
};

/** Keeps article language selection, URL updates, and the fallback banner together. */
export function useTranslationSwitcher({
    content,
    contentOverride,
    translations,
    languages,
    preferredLanguageId,
    forcedLanguageCode,
    router,
    translate,
}: TranslationSwitcherOptions) {
    const selectedLanguageId = ref(preferredLanguageId.value);
    const hasAutoNavigated = ref(false);
    const previousPreferredId = ref(preferredLanguageId.value);
    const openedFromExternalLink = ref(false);
    const userSwitchedLanguage = ref(false);

    watch(
        [translations, languages],
        () => {
            if (!forcedLanguageCode || !translations.value.length || !languages.value.length)
                return;
            const language = languages.value.find(
                (item) => item.languageCode === forcedLanguageCode,
            );
            const translation =
                language && translations.value.find((item) => item.language === language._id);
            if (!translation || !language) return;
            selectedLanguageId.value = language._id;
            contentOverride.value = translation;
        },
        { immediate: true },
    );

    watch(
        [content, preferredLanguageId],
        ([currentContent, preferredId]) => {
            if (!currentContent) return;
            const preferredLanguageChanged = previousPreferredId.value !== preferredId;
            previousPreferredId.value = preferredId;
            const preferredTranslation = translations.value.find(
                (item) => item.language === preferredId,
            );

            if (
                preferredLanguageChanged &&
                hasAutoNavigated.value &&
                preferredTranslation &&
                preferredTranslation.slug !== currentContent.slug
            ) {
                contentOverride.value = preferredTranslation;
                const newUrl = router.resolve({
                    name: "content",
                    params: { slug: preferredTranslation.slug },
                }).href;
                window.history.replaceState(window.history.state, "", newUrl);
                selectedLanguageId.value = preferredTranslation.language;
                return;
            }

            if (!hasAutoNavigated.value) {
                hasAutoNavigated.value = true;
                if (preferredTranslation && preferredTranslation.slug !== currentContent.slug) {
                    router.replace({
                        name: "content",
                        params: { slug: preferredTranslation.slug },
                    });
                    return;
                }
            }

            selectedLanguageId.value = currentContent.language;
        },
        { immediate: true },
    );

    onMounted(() => {
        openedFromExternalLink.value = isExternalNavigation();
    });

    watch(selectedLanguageId, (languageId) => {
        if (!languageId || !content.value) return;
        const target = translations.value.find((item) => item.language === languageId);
        if (!target || target.slug === content.value.slug) return;
        userSwitchedLanguage.value = true;
        contentOverride.value = target;
        const newUrl = router.resolve({ name: "content", params: { slug: target.slug } }).href;
        window.history.replaceState(window.history.state, "", newUrl);
    });

    watch(
        [content, preferredLanguageId, openedFromExternalLink, translations],
        ([currentContent, preferredId, external]) => {
            if (!currentContent || !preferredId || !external || userSwitchedLanguage.value) return;
            if (currentContent.language === preferredId) return;
            const preferred = translations.value.find(
                (item) => item.language === preferredId && item.slug !== currentContent.slug,
            );
            if (!preferred) return;
            setTimeout(() => {
                useNotificationStore().addNotification({
                    id: "content-available",
                    title: () => translate("notification.translation_available.title"),
                    description: () =>
                        translate("notification.translation_available.description", {
                            language: appLanguageAsRef.value?.name,
                        }),
                    state: "info",
                    type: "banner",
                    closable: true,
                    link: { name: "content", params: { slug: preferred.slug } },
                    openLink: true,
                });
            }, 800);
        },
        { immediate: true },
    );

    watch(
        () => content.value?.language,
        (languageId) => {
            if (languageId === preferredLanguageId.value) {
                useNotificationStore().removeNotification("content-available");
            }
        },
        { immediate: true },
    );

    return {
        selectedLanguageId,
        selectedLanguageCode: computed(
            () =>
                languages.value.find((language) => language._id === selectedLanguageId.value)
                    ?.languageCode ?? null,
        ),
    };
}
