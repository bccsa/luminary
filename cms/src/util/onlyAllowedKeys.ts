/**
 * Reduce an object to allowed keys
 * @param raw
 * @param allowed
 * @returns The original `raw` object with only the provided `allowed` keys
 */
export const onlyAllowedKeys = (raw: any, allowed: string[]) => {
    return Object.keys(raw)
        .filter((key) => allowed.includes(key))
        .reduce((obj, key) => {
            return {
                ...obj,
                [key]: raw[key],
            };
        }, {});
};
