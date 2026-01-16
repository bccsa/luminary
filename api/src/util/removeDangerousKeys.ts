/**
 * Check if a key is a dangerous prototype pollution key
 * https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/Prototype_pollution
 */
export function isDangerousKey(key: string): boolean {
    return key === "__proto__" || key === "constructor" || key === "prototype";
}

/**
 * Recursively clean an object from prototype pollution keys
 * This prevents attackers from modifying the prototype of built-in objects
 */
export function removeDangerousKeys(obj: any): any {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(removeDangerousKeys);

    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (isDangerousKey(key)) {
            continue;
        }
        cleaned[key] = removeDangerousKeys(value);
    }
    return cleaned;
}
