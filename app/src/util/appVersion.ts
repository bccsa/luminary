type Version = [number, number, number];

function parseVersion(version: string): Version | undefined {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

/**
 * Whether `candidate` is a later `major.minor.patch` version than `current`.
 * A version that can't be parsed is never later.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
    const next = parseVersion(candidate);
    const installed = parseVersion(current);
    if (!next || !installed) return false;

    for (let i = 0; i < 3; i++) {
        if (next[i] !== installed[i]) return next[i] > installed[i];
    }
    return false;
}
