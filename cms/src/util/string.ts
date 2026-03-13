export function capitaliseFirstLetter(s: string | undefined): string {
    if (s == null || s === "") return "";
    return s.charAt(0).toUpperCase() + s.slice(1);
}
