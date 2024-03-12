import { slugify } from "transliteration";
import { db } from "@/db/baseDatabase";
import type { Uuid } from "@/types";

/**
 * Functions to generate and validate slugs
 */
export class Slug {
    /**
     * Automatically generates a unique slug from a title.
     * Ignores the current documentId when checking for uniqueness.
     */
    static async generate(title: string, documentId: Uuid) {
        const slug = slugify(title, {
            lowercase: true,
            separator: "-",
        });
        return await this.makeUnique(slug, documentId);
    }

    /**
     * Ensures the slug is unique
     * @returns Promise containing a unique slug
     */
    static async makeUnique(slug: string, documentId: Uuid) {
        while (!(await this._checkUnique(slug, documentId))) {
            slug = `${slug}-${Math.floor(Math.random() * 999)}`;
        }
        return slug;
    }

    /**
     * Returns true if the slug is unique
     */
    private static async _checkUnique(slug: string, documentId: Uuid) {
        const existingDocWithSlug = await db.docs.where("slug").equals(slug).first();

        if (existingDocWithSlug && existingDocWithSlug._id != documentId) {
            return false;
        }

        return true;
    }
}
