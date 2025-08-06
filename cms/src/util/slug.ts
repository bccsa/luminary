import { slugify } from "transliteration";
import { db, DocType, type Uuid } from "luminary-shared";

/**
 * Functions to generate and validate slugs
 */
export class Slug {
    /**
     * Converts a string to a slug without uniqueness validation
     */
    static generateNonUnique(text: string) {
        const slug = slugify(text, {
            lowercase: true,
            separator: "-",
        });

        // Remove trailing dashes and clean up multiple consecutive dashes
        // This ensures this only happens after the user has finished typing
        // and not while they are typing.
        return slug.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    }

    /**
     * Automatically generates a unique slug from a title.
     * Ignores the current documentId when checking for uniqueness.
     */
    static async generate(text: string, documentId: Uuid) {
        const slug = this.generateNonUnique(text);
        return await this.makeUnique(slug, documentId);
    }

    /**
     * Ensures the slug is unique
     * @returns Promise containing a unique slug
     */
    static async makeUnique(text: string, documentId: Uuid) {
        while (!(await this.checkUnique(text, documentId))) {
            text = `${text}-${Math.floor(Math.random() * 999)}`;
        }
        return text;
    }

    /**
     * Returns true if the slug is unique
     */
    public static async checkUnique(text: string, documentId: Uuid, docType?: DocType) {
        let query = db.docs.where("slug").equals(text);
        if (docType) query = query.and((doc) => doc.type === docType);
        const res = await query.first();

        if (res && res._id != documentId) {
            return false;
        }

        return true;
    }
}
