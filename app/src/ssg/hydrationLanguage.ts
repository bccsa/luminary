import {
    appLanguageIdsAsRef,
    appSyncedLanguageIdsAsRef,
    suspendLanguagePersistence,
} from "@/globalConfig";

type StoredPreferences = { preferred: string[]; synced: string[] };

const readStored = (key: string): string[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === "string")
            : [];
    } catch {
        return [];
    }
};

const sameOrder = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);

const applyStored = (stored: StoredPreferences) => {
    if (!sameOrder(stored.preferred, appLanguageIdsAsRef.value)) {
        appLanguageIdsAsRef.value = stored.preferred;
    }
    if (stored.synced.length && !sameOrder(stored.synced, appSyncedLanguageIdsAsRef.value)) {
        appSyncedLanguageIdsAsRef.value = stored.synced;
    }
};

/**
 * Adopt the language the edge served for this URL, then hand the visitor their own preference back
 * once the page has hydrated.
 *
 * The served language is a property of the URL (the edge rewrites by `Accept-Language`), not a
 * choice the visitor made: it drives the first client render so hydration matches the prerendered
 * HTML, but it is never persisted and never overwrites a stored preference. Restoring that
 * preference is deferred to a macrotask so it lands after `app.mount` — applying it earlier would
 * make the first render disagree with the prerendered markup (a hydration mismatch) rather than a
 * clean switch afterwards.
 */
export function applyServedLanguage(renderLang: string): void {
    const stored: StoredPreferences = {
        preferred: readStored("languages"),
        synced: readStored("syncedLanguages"),
    };

    suspendLanguagePersistence();
    if (renderLang) appLanguageIdsAsRef.value = [renderLang];

    if (stored.preferred.length) setTimeout(() => applyStored(stored), 0);
}
