export * from "./MangoTypes";
export * from "./queryCache";
export * from "./mangoCompile";
export * from "./mangoToDexie";
export * from "./expandMangoQuery";
export * from "./templateNormalize";
export * from "./compileTemplateSelector";

import { warmMangoCompileCache } from "./mangoCompile";
import { warmDexieAnalysisCache } from "./mangoToDexie";

/**
 * Pre-warm all Mango query caches from templates persisted in localStorage.
 *
 * Call this once, early in app startup (before components mount), to eliminate
 * cold-start compilation and analysis latency. On the first visit the persisted
 * store is empty and this is a no-op. As queries execute, their templates are
 * automatically saved to localStorage. On subsequent page loads this function
 * restores and pre-compiles them so the first real queries hit a warm cache.
 */
export function warmMangoCaches(): void {
    warmMangoCompileCache();
    warmDexieAnalysisCache();
}
