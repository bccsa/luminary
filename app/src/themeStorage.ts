/**
 * Theme storage key, shared between `globalConfig.ts` and the web/SSG pre-paint theme
 * script. Kept in its own import-safe module so the build config can read it from Node
 * without pulling in `globalConfig.ts`, which touches `window`/`document` at import time.
 */

/** localStorage key holding the selected theme: `"system"`, `"dark"` or `"light"`. */
export const THEME_STORAGE_KEY = "theme";
