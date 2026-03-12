/**
 * Dexie index definition for the CMS's docs table.
 * Used by both main.ts (runtime) and vitest.setup.ts (tests)
 * to ensure test indexes match production indexes.
 */
export const CMS_DOCS_INDEX =
    "type, parentId, updatedTimeUtc, language, [type+tagType], [type+docType], [type+language], slug, title, [type+parentType+language], [type+parentTagType]";
