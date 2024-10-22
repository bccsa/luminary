/**
 * Reduce an object to allowed keys
 * @param raw
 * @param allowed
 * @returns The original `raw` object with only the provided `allowed` keys
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
