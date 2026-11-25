import { slugify } from "transliteration";

/**
 * Converts a title to a slug without a uniqueness check, exactly as the CMS does
 * (`cms/src/util/slug.ts`), so docs created through MCP get the same slugs.
 */
export function generateNonUniqueSlug(text: string): string {
    const processed = text
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.,:;!?()[\]{}'"]/g, "")
        .replace(/[&]/g, "and")
        .replace(/[@#$%^*+=|\\/<>]/g, "");

    const slug = slugify(processed, {
        lowercase: true,
        separator: "-",
        replace: [
            [/\s+/g, "-"],
            [/[^\w-]/g, ""],
        ],
    });

    return slug
        .replace(/_/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Normalises a redirect slug exactly as the CMS redirect form does
 * (`cms/src/components/redirects/CreateOrEditRedirectModal.vue`): the API stores what it is given.
 */
export function normalizeRedirectSlug(slug: string): string {
    return slug.replace(/[^a-zA-Z0-9-_]/g, "").toLowerCase();
}
