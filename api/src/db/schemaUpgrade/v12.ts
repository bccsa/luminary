import { DbService } from "../db.service";
import { DocType } from "../../enums";
import { generateHTML } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

/**
 * Checks whether a text field contains TipTap JSON format.
 * TipTap JSON always has a root object with type "doc" and a content array.
 */
function isTipTapJson(text: string): boolean {
    if (text.trimStart().charAt(0) !== "{") {
        return false;
    }
    try {
        const parsed = JSON.parse(text);
        return (
            parsed &&
            typeof parsed === "object" &&
            parsed.type === "doc" &&
            Array.isArray(parsed.content)
        );
    } catch {
        return false;
    }
}

/**
 * Converts a TipTap JSON string to HTML using the same extensions
 * that the app previously used at runtime.
 */
function convertTipTapToHtml(tiptapJson: string): string {
    const parsed = JSON.parse(tiptapJson);
    return generateHTML(parsed, [StarterKit, Link]);
}

/**
 * Upgrade the database schema from version 11 to 12.
 * Converts all Content document `text` fields from TipTap JSON to HTML.
 * Documents that already have HTML text (or no text) are skipped.
 */
export default async function (db: DbService) {
    try {
        const schemaVersion = await db.getSchemaVersion();
        if (schemaVersion === 11) {
            console.info("Upgrading database schema from version 11 to 12");

            let convertedCount = 0;
            let skippedCount = 0;

            await db.processAllDocs([DocType.Content], async (doc: any) => {
                if (!doc) return;

                // Skip documents without a text field
                if (!doc.text) {
                    skippedCount++;
                    return;
                }

                // Skip documents that are already HTML (not TipTap JSON)
                if (!isTipTapJson(doc.text)) {
                    skippedCount++;
                    return;
                }

                try {
                    const html = convertTipTapToHtml(doc.text);
                    doc.text = html;
                    // Use insertDoc to preserve the existing updatedTimeUtc
                    await db.insertDoc(doc);
                    convertedCount++;
                } catch (error) {
                    console.error(
                        `Failed to convert TipTap JSON to HTML for document ${doc._id}:`,
                        error,
                    );
                }
            });

            console.info(
                `TipTap migration complete: ${convertedCount} converted, ${skippedCount} skipped`,
            );

            await db.setSchemaVersion(12);
            console.info("Database schema upgrade from version 11 to 12 completed successfully");
        } else {
            console.info(
                `Skipping schema upgrade v12: current version is ${schemaVersion}, expected 11`,
            );
        }
    } catch (error) {
        console.error("Database schema upgrade from version 11 to 12 failed:", error);
        throw error;
    }
}
