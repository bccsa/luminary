import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
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

    /** The reader's own language, offered on an article opened from outside in another one. */
    const offeredSlug = computed(() => {
        const currentContent = content.value;
        const preferredId = preferredLanguageId.value;
        if (!currentContent || !preferredId || !openedFromExternalLink.value) return undefined;
        if (userSwitchedLanguage.value || currentContent.language === preferredId) return undefined;
        return translations.value.find(
            (item) => item.language === preferredId && item.slug !== currentContent.slug,
        )?.slug;
    });

    // The banner belongs to the article that offers it: it shows after a short delay, and goes
    // whenever there is no offer, including on the article it led to and when the page is left.
    // So a switch made while it is pending, or while the new page loads, can't bring it back.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const withdraw = () => {
        clearTimeout(pending);
        useNotificationStore().removeNotification("content-available");
    };
    watch(
        offeredSlug,
        (slug) => {
            if (!slug) return withdraw();
            clearTimeout(pending);
            pending = setTimeout(() => {
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
                    link: { name: "content", params: { slug } },
                    openLink: true,
                });
            }, 800);
        },
        { immediate: true },
    );
    onBeforeUnmount(withdraw);

    return {
        selectedLanguageId,
        selectedLanguageCode: computed(
            () =>
                languages.value.find((language) => language._id === selectedLanguageId.value)
                    ?.languageCode ?? null,
        ),
    };
}
