import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { computed } from "vue";
import { db, DocType, type LanguageDto } from "luminary-shared";

const languageLocalStorageId = useLocalStorage("language", "");
const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

export const useGlobalConfigStore = defineStore("globalConfig", () => {
    const appName = import.meta.env.VITE_APP_NAME;
    const apiUrl = import.meta.env.VITE_API_URL;
    const isDevMode = import.meta.env.DEV;

    const appLanguage = computed({
        get() {
            const preferedLanguage = languages.value.find(
                (l) => l._id == languageLocalStorageId.value,
            );

            if (preferedLanguage) {
                return preferedLanguage;
            }

            if (languages.value.length > 0) {
                return languages.value[0];
            }

            return undefined;
        },
        set(val) {
            languageLocalStorageId.value = val?._id;
            location.reload();
        },
    });
    return { appName, apiUrl, isDevMode, appLanguage };
});
