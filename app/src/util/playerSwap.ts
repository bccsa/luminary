/**
 * Navigations made by the player itself when it swaps to the next video in full-screen. The app
 * leaves its usual reaction to a route change out for these, because it would end full-screen.
 *
 * Plain variables, not refs: they are read while the route key is computed and cleared after the
 * render, and a reactive flag would recompute the key on clearing.
 */
let contentSwapPath: string | null = null;
let playerSwapPath: string | null = null;

/** The page at `path` keeps its instance (and so its embedded player) instead of being recreated. */
export function markContentSwap(path: string): void {
    contentSwapPath = path;
}
export function isContentSwap(path: string): boolean {
    return contentSwapPath === path;
}

/** The app-wide player stays expanded across the navigation to `path`. */
export function markPlayerSwap(path: string): void {
    playerSwapPath = path;
}
export function isPlayerSwap(path: string): boolean {
    return playerSwapPath === path;
}

export function clearSwaps(): void {
    contentSwapPath = null;
    playerSwapPath = null;
}
