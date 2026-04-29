/**
 * Resolves i18n keys in CMS-style labels.
 * Supports either a full dotted key (`auth.login.button`) or embedded keys (`[[auth.login.button]]`).
 */
export function resolveI18nEmbedded(
    input: string | undefined,
    translate: (key: string) => string,
): string {
    const raw = input ?? "";
    if (!raw.trim()) return "";

    const dottedKeyPattern = /^[\w]+(\.[\w]+)+$/;
    const embeddedKeyPattern = /\[\[\s*([\w.]+)\s*\]\]/g;
    const trimmed = raw.trim();

    if (dottedKeyPattern.test(trimmed)) {
        return translate(trimmed);
    }

    return raw.replace(embeddedKeyPattern, (_match, key: string) => translate(key));
}
