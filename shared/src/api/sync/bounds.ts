/**
 * Sentinel values for "open" / unset publishDate bounds.
 * Use Number.MIN_SAFE_INTEGER / Number.MAX_SAFE_INTEGER (NOT -Infinity / +Infinity)
 * so the values survive JSON serialization through CouchDB and the POST /query selector.
 *
 * Kept in a dependency-free module so the pure planners can compare against the same
 * sentinel the sync engine writes, without importing sync state (and thus Vue).
 */
export const OPEN_MIN = Number.MIN_SAFE_INTEGER;
export const OPEN_MAX = Number.MAX_SAFE_INTEGER;
