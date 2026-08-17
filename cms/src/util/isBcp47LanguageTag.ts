export function isBcp47LanguageTag(value: unknown): value is string {
    if (typeof value !== "string" || !value) return false;
    try {
        new Intl.Locale(value);
        return true;
    } catch {
        return false;
    }
}
