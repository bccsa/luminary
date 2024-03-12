import { DbService } from "../db/db.service";
import { Uuid } from "../enums";
import { slugify } from "transliteration";

/**
 * Ensures the slug is unique, and if not, appends a random number to the end of the slug until it is unique
 * @param slug - The slug to validate
 * @param documentId - The id of the document to which the slug belongs
 * @param db - The database service
 * @returns Promise containing a unique slug
 */
export async function validateSlug(slug: string, documentId: Uuid, db: DbService) {
    // Ensure the slug is a valid slug
    slug = slugify(slug, { lowercase: true, separator: "-" });

    // Ensure the slug is unique
    while (!(await db.checkUniqueSlug(slug, documentId))) {
        slug = `${slug}-${Math.floor(Math.random() * 999)}`;
    }
    return slug;
}
