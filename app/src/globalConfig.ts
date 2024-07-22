import { db, DocType, type LanguageDto } from "luminary-shared";
import { readonly, ref, watch } from "vue";

export const appName = import.meta.env.VITE_APP_NAME;
export const apiUrl = import.meta.env.VITE_API_URL;
export const isDevMode = import.meta.env.DEV;

// Note: We could have used useLocalStorage from vueuse, but it seems to be difficult
// to test as mocking localStorage is not working very well. For this reason
// we are using a watcher so that we can use the ref directly and test it easily
// without interactions with localStorage (which we choose to ignore for now in testing).

/**
 * The preferred language ID as Vue ref.
 */
export const appLanguageIdAsRef = ref(localStorage.getItem("language") || "");
watch(appLanguageIdAsRef, (newVal) => {
    localStorage.setItem("language", newVal);
});

const _appLanguageAsRef = ref<LanguageDto | undefined>();
/**
 * The preferred language document as Vue ref.
 */
export const appLanguageAsRef = readonly(_appLanguageAsRef);

export const initLanguage = () => {
    const languages = db.whereTypeAsRef<LanguageDto[]>(DocType.Language, []);

    // Set the preferred language to the first language in the list if it is not set
    watch(languages, (newVal) => {
        if (
            newVal.length > 0 &&
            (!appLanguageIdAsRef.value || !newVal.some((l) => l._id === appLanguageIdAsRef.value))
        ) {
            appLanguageIdAsRef.value = newVal[0]._id;
        }
    });

    // Set the preferred language document
    watch([appLanguageIdAsRef, languages], () => {
        if (appLanguageIdAsRef.value && languages.value.length > 0) {
            _appLanguageAsRef.value = languages.value.find(
                (l) => l._id === appLanguageIdAsRef.value,
            );
        }
    });
};
