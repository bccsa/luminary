import { db, DocType } from "luminary-shared";
import { ref, watch } from "vue";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const isDevMode = import.meta.env.DEV;

// Note: We could have used useLocalStorage from vueuse, but it seems to be difficult
// to test as mocking localStorage is not working very well. In this way we can use
// the ref directly and test it easily except for interactions with localStorage which
// we choose to ignore for now in testing.

/**
 * The preferred language ID as Vue ref.
 */
export const appLanguageIdAsRef = ref(localStorage.getItem("language") || "");
watch(appLanguageIdAsRef, (newVal) => {
    localStorage.setItem("language", newVal);
});

export const initLanguage = () => {
    const languages = db.whereTypeAsRef(DocType.Language);
    watch(languages, (newVal) => {
        if (
            newVal.length > 0 &&
            (!appLanguageIdAsRef.value || !newVal.some((l) => l._id === appLanguageIdAsRef.value))
        ) {
            appLanguageIdAsRef.value = newVal[0]._id;
        }
    });
};
