/**
 * Built-ins the bundle calls that older Chromium lacks. Video.js 10 calls `Object.hasOwn` (Chrome 93)
 * in every element's constructor, so without it no player can be created on BrunstadTV BOX Pis
 * running Raspberry Pi OS Buster, whose Chromium stops at 92. Must be the entry's first import.
 */

type Targets = { object: object; atProtos: object[] };

function hasOwn(obj: object, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function at<T>(this: ArrayLike<T>, index: number): T | undefined {
    const n = Math.trunc(index) || 0;
    const i = n < 0 ? this.length + n : n;
    return i < 0 || i >= this.length ? undefined : this[i];
}

function define(target: object, name: string, value: unknown): void {
    if (typeof (target as Record<string, unknown>)[name] === "function") return;
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
}

/** Adds whichever of the polyfills `targets` is missing; exported so tests need not strip real globals. */
export function installPolyfills(targets: Targets): void {
    define(targets.object, "hasOwn", hasOwn);
    for (const proto of targets.atProtos) define(proto, "at", at);
}

installPolyfills({
    object: Object,
    atProtos: [Array.prototype, String.prototype, Object.getPrototypeOf(Int8Array.prototype)],
});
