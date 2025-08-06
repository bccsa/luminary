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
        // Pre-process: normalize whitespace and handle special cases
        const processed = text
            .trim() // Remove leading/trailing whitespace
            .replace(/\s+/g, " ") // Normalize multiple whitespace to single space
            .replace(/[.,:;!?()[\]{}'"]/g, "") // Remove common punctuation
            .replace(/[&]/g, "and") // Convert & to "and"
            .replace(/[@#$%^*+=|\\/<>]/g, ""); // Remove special symbols

        const slug = slugify(processed, {
            lowercase: true,
            separator: "-",
            replace: [
                [/\s+/g, "-"], // Replace any remaining whitespace with dashes
                [/[^\w-]/g, ""], // Remove any non-word characters except dashes
            ],
        });

        // Post-process: clean up the result
        return slug
            .replace(/_/g, "-") // Convert underscores to dashes
            .replace(/-+/g, "-") // Replace multiple dashes with single dash
            .replace(/^-+|-+$/g, ""); // Remove leading and trailing dashes
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
