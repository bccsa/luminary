import { slugify } from "transliteration";
import { db } from "@/db/baseDatabase";
import type { Uuid } from "@/types";

/**
 * Functions to generate and validate slugs
 */
export class Slug {
    /**
     * Automatically generates a unique slug from a title
     */
    static async generate(title: string, contentId: Uuid) {
        const slug = slugify(title, {
            lowercase: true,
            separator: "-",
        });
        return await this.makeUnique(slug, contentId);
    }

    /**
     * Ensures the slug is unique
     * @returns Promise containing a unique slug
     */
    static async makeUnique(slug: string, contentId: Uuid) {
        while (!(await this._checkUnique(slug, contentId))) {
            slug = `${slug}-${Math.floor(Math.random() * 999)}`;
        }
        return slug;
    }

    /**
     * Returns true if the slug is unique
     */
    private static async _checkUnique(slug: string, contentId: Uuid) {
        const existingContentWithSlug = await db.docs.where("slug").equals(slug).first();

        if (existingContentWithSlug && existingContentWithSlug._id != contentId) {
            return false;
        }

        return true;
    }
}
