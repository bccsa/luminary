/**
 * Dexie index definition for the app's docs table.
 * Used by both main.ts (runtime) and vitest.setup.ts (tests)
 * to ensure test indexes match production indexes.
 */
export const APP_DOCS_INDEX =
    "type, parentId, [parentId+status], slug, language, publishDate, expiryDate, [type+status], [type+parentPinned], [type+parentPinned+status], [type+parentPinned+parentTagType+status], [parentType+parentTagType+status], [type+status+parentTagType], [type+parentType+status], [parentType+status]";
