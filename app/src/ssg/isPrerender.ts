/**
 * True only during the vite-ssg prerender pass (statically false in the hydrated client
 * and the normal SPA). A function (not a constant) so every call re-reads
 * `import.meta.env.SSR` fresh — some callers are invoked once per component/query
 * instance, and tests flip the flag per case, which a value cached at module-import
 * time would miss.
 */
export function isPrerender(): boolean {
    return import.meta.env.SSR;
}
