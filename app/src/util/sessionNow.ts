/**
 * The session's reference "now" — captured **once** on first read (≈ page load)
 * and held constant for the lifetime of the page.
 *
 * Why this exists: publish/expiry bounds derived from `Date.now()` are embedded
 * directly in Mango query selectors, and `HybridQuery` uses the serialized
 * selector as its reactive dedup key. A live `Date.now()` therefore makes every
 * reactive re-evaluation of a query thunk produce a *different* key — defeating
 * the dedup and firing a redundant API-supplement POST whenever any tracked ref
 * changes during load. Freezing the reference time to a single value makes those
 * selectors byte-stable, so a thunk only rebuilds when something *semantic*
 * changes. This mirrors `contentPublishDateCutoff` in `main.ts`, which is likewise
 * captured once at startup.
 *
 * Trade-off: in a long-lived session the bound does not advance, so content that
 * crosses its publish or expiry boundary after load only reflects on the next page
 * load. That is acceptable for authored content; if a long session ever needs to
 * pick up scheduled transitions live, promote this to a ref ticked on a coarse
 * interval (every query referencing it then rebuilds together, once per tick).
 */
let _sessionNow: number | undefined;

/** The frozen session reference timestamp (ms). Captured on first call. */
export function sessionNow(): number {
    if (_sessionNow === undefined) _sessionNow = Date.now();
    return _sessionNow;
}

/**
 * @internal Test-only — clear the captured value so the next {@link sessionNow}
 * call re-captures (models a fresh page load). Not for production use.
 */
export function __resetSessionNow(): void {
    _sessionNow = undefined;
}
