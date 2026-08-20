import { useI18n } from "vue-i18n";
import { authCopy, type AuthCopyKey } from "./authCopy";

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match,
    );
}

/**
 * Resolves an auth string from the synced language docs, falling back to the
 * English default in `authCopy` while a key has no translation yet. Screens can
 * therefore be designed and reviewed before the keys exist.
 */
export function useAuthCopy() {
    const { t, te } = useI18n();

    return (key: AuthCopyKey, params?: Params): string =>
        te(key) ? t(key, params ?? {}) : interpolate(authCopy[key], params);
}
