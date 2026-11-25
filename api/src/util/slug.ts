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
