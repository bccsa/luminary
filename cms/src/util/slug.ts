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
        return slugify(text, {
            lowercase: true,
            separator: "-",
        });
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
        while (!(await this._checkUnique(text, documentId))) {
            text = `${text}-${Math.floor(Math.random() * 999)}`;
        }
        return text;
    }

    /**
     * Returns true if the slug is unique
     */
    public static async _checkUnique(text: string, documentId: Uuid, docType?: DocType) {
        let existingDocWithSlug;

        if (docType) {
            existingDocWithSlug = await db.docs
                .where("slug")
                .equals(text)
                .and((doc) => doc.type === docType)
                .first();
        } else {
            existingDocWithSlug = await db.docs.where("slug").equals(text).first();
        }

        if (existingDocWithSlug && existingDocWithSlug._id != documentId) {
            return false;
        }

        return true;
    }
}
