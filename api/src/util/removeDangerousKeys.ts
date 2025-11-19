export function removeDangerousKeys(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(removeDangerousKeys);

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
            continue;
        }
        cleaned[key] = removeDangerousKeys(value);
    }
    return cleaned;
}
