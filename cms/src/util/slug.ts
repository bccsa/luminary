import { slugify } from "transliteration";
import { db } from "@/db/baseDatabase";

/**
 * Functions to generate and validate slugs
 */
export class Slug {
    /**
     * Automatically generates a unique slug from a title
     * @param title
     * @returns
     */
    static async generate(title: string) {
        const slug = slugify(title, {
            lowercase: true,
            separator: "-",
        });
        return await this.makeUnique(slug);
    }

    /**
     * Ensures the slug is unique
     * @param slug
     * @returns Promise containing a unique slug
     */
    static async makeUnique(slug: string) {
        while (!(await this._checkUnique(slug))) {
            slug = `${slug}-${Math.floor(Math.random() * 999)}`;
        }
        return slug;
    }

    /**
     * Returns true if the slug is unique
     * @param slug
     * @returns
     */
    private static async _checkUnique(slug: string) {
        const existingSlug = await db.docs.where("slug").equals(slug).count();

        return existingSlug === 0;
    }
}
