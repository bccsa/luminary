import { ref } from "vue";

/**
 * The session's reference "now" — captured once at page load (module import) and
 * held as a reactive ref.
 *
 * Why this is a ref (and not a plain frozen value, nor a live `Date.now()`):
 * publish/expiry bounds derived from it are embedded directly in Mango query
 * selectors, and `HybridQuery` serializes the selector as its reactive dedup key
 * (`HybridQuery.ts`). A live `Date.now()` re-keys the query on every tracked-ref
 * change and re-fires the API-supplement POST; a plain frozen value never re-keys,
 * so content published after the page-load instant is filtered out by the
 * `publishDate <= now` clause until a page refresh. The ref is the compromise: it
 * stays byte-stable (no re-key) until explicitly advanced by {@link bumpSessionNow},
 * which live-sync calls when newly published content arrives. So the bound moves
 * exactly when new content does — truly live for publishes, with zero idle churn.
 *
 * This mirrors `contentPublishDateCutoff` in `main.ts`, likewise captured once at
 * startup; the difference is this bound can advance at runtime.
 *
 * Trade-off: the bound only advances when a live-sync `"data"` push delivers new
 * content. A long-lived session where scheduled content crosses its publish
 * boundary with NO concurrent live push won't reveal it until the next live event
 * or a page refresh. Acceptable for authored content.
 */
const _sessionNow = ref<number | undefined>(Date.now());

/** The session reference timestamp (ms). Captured at page load; advances only via {@link bumpSessionNow}. */
export function sessionNow(): number {
    // Re-capture after a test reset (production never hits this — eager-init above).
    if (_sessionNow.value === undefined) _sessionNow.value = Date.now();
    return _sessionNow.value;
}

/**
 * Advance the session reference time forward to `to` (no-op if `to` is not newer).
 * Live-sync calls this when newly published content arrives so the
 * `publishDate <= now` bound lets the new doc through — every content query that
 * reads {@link sessionNow} rebuilds once, exactly when new content lands.
 *
 * Forward-only by design: moving the bound backward would re-hide already-shown
 * content and could loop queries. Callers must pass the real clock (`Date.now()`),
 * never a doc's future `publishDate` — otherwise genuinely scheduled content
 * (future `publishDate`, no coming-soon) would be revealed prematurely.
 */
export function bumpSessionNow(to: number): void {
    if (_sessionNow.value === undefined || to > _sessionNow.value) _sessionNow.value = to;
}

/**
 * Pin the reference time to a specific value instead of capturing `Date.now()` on
 * first read. The SSG prerender pins this to the route-enumeration timestamp so every
 * per-page query's `publishDate <= now` bound matches the slug routes actually
 * prerendered — a doc published mid-build then can't surface on a feed tile (served
 * from the drained corpus) without a matching slug page. Safe to call before the
 * first `sessionNow()` read; a later call is a no-op so the prerender's pin wins.
 */
export function setSessionNow(n: number): void {
    if (_sessionNow.value === undefined) _sessionNow.value = n;
}

/**
 * @internal Test-only — clear the captured value so the next {@link sessionNow}
 * call re-captures (models a fresh page load). Not for production use.
 */
export function __resetSessionNow(): void {
    _sessionNow.value = undefined;
}