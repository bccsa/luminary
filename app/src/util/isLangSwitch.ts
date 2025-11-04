import { ref, watch, type Ref } from "vue";
import type { ContentDto, Uuid } from "luminary-shared";
import { appLanguageAsRef, appLanguageIdsAsRef, cmsLanguages } from "@/globalConfig";

/** Reactive flag to detect language switch */
export const isLanguageSwitchRef = ref(localStorage.getItem("isLanguageSwitch") === "true");

watch(isLanguageSwitchRef, (val) => {
    localStorage.setItem("isLanguageSwitch", val ? "true" : "false");
});

export const markLanguageSwitch = () => {
    isLanguageSwitchRef.value = true;
};

export const consumeLanguageSwitchFlag = (): boolean => {
    const value = isLanguageSwitchRef.value;
    isLanguageSwitchRef.value = false;
    return value;
};

type LanguageSelectOptions = {
    add?: boolean;
    increasePriority?: boolean;
    decreasePriority?: boolean;
};

interface HandleLanguageChangeArgs {
    mainSelector?: boolean;
    options?: LanguageSelectOptions;
    languageId?: Uuid;
    previousLanguage?: Uuid;
    availableTranslations?: ContentDto[];
    content?: Ref<ContentDto>;
}

export const handleLanguageChange = ({
    mainSelector = false,
    options = {},
    languageId,
    availableTranslations,
    content,
}: HandleLanguageChangeArgs) => {
    markLanguageSwitch();

    if (!languageId) {
        console.warn("Missing Argument: languageId");
        return;
    }

    // --- Update content ---
    if (availableTranslations && content) {
        const preferred = availableTranslations.find((c) => c.language === languageId);
        if (preferred && preferred.slug !== content.value.slug) {
            content.value = preferred;
        }
    }

    // --- Update global language preferences ---
    if (options.add) {
        if (!appLanguageIdsAsRef.value.includes(languageId)) {
            appLanguageIdsAsRef.value.push(languageId);
        }
        return;
    }

    const index = appLanguageIdsAsRef.value.indexOf(languageId);
    if (index === -1) return;
    if (options.increasePriority && index > 0) {
        [appLanguageIdsAsRef.value[index - 1], appLanguageIdsAsRef.value[index]] = [
            appLanguageIdsAsRef.value[index],
            appLanguageIdsAsRef.value[index - 1],
        ];
    }
    if (options.decreasePriority && index < appLanguageIdsAsRef.value.length - 1) {
        [appLanguageIdsAsRef.value[index + 1], appLanguageIdsAsRef.value[index]] = [
            appLanguageIdsAsRef.value[index],
            appLanguageIdsAsRef.value[index + 1],
        ];
    }

    // --- Update preferred language globally ---
    if (mainSelector) {
        const lang = cmsLanguages.value.find((c) => c._id === languageId);
        if (lang) {
            appLanguageAsRef.value = lang; // ← Always update!
        }
    }
};
