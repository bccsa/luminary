import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { DbService } from "./db.service";
import { LanguageDto } from "../dto/LanguageDto";
import { DocType } from "../enums";

const logger = new Logger("LanguageTranslationSeedReconciliation");

const SEEDED_LANGUAGE_IDS = ["lang-eng", "lang-fra"] as const;
type SeededLanguageId = (typeof SEEDED_LANGUAGE_IDS)[number];
type SeedTranslations = Record<SeededLanguageId, Record<string, string>>;

function isTranslationsMap(value: unknown): value is Record<string, string> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function readTranslations(seedDir: string, fileName: string): Record<string, string> {
    const doc = JSON.parse(fs.readFileSync(path.join(seedDir, fileName)).toString());
    if (!isTranslationsMap(doc.translations)) {
        throw new Error(`${fileName} does not contain a translations object`);
    }
    return doc.translations;
}

export function readSeedLanguageTranslations(
    seedDir = path.join(__dirname, "seedingDocs"),
): SeedTranslations {
    return {
        "lang-eng": readTranslations(seedDir, "lang-eng.json"),
        "lang-fra": readTranslations(seedDir, "lang-fra.json"),
    };
}

export async function reconcileLanguageTranslationSeeds(
    db: DbService,
    seedTranslations = readSeedLanguageTranslations(),
) {
    const allowedKeys = new Set<string>();
    for (const translations of Object.values(seedTranslations)) {
        Object.keys(translations).forEach((key) => allowedKeys.add(key));
    }

    const seenSeedLanguages = new Set<string>();
    let updatedCount = 0;
    let unchangedCount = 0;

    await db.processAllDocs([DocType.Language], async (doc: LanguageDto) => {
        if (SEEDED_LANGUAGE_IDS.includes(doc._id as SeededLanguageId)) {
            seenSeedLanguages.add(doc._id);
        }

        const currentTranslations = isTranslationsMap(doc.translations) ? doc.translations : {};
        const nextTranslations: Record<string, string> = {};
        let changed = false;

        // Pruning applies to every language, not just the seeded ones: any key absent from
        // both seed files is dropped everywhere so a key removed from en/fr can't linger on
        // other languages either.
        for (const [key, value] of Object.entries(currentTranslations)) {
            if (allowedKeys.has(key)) {
                nextTranslations[key] = value;
            } else {
                changed = true;
            }
        }

        const seededTranslations = (seedTranslations as Record<string, Record<string, string>>)[
            doc._id
        ];
        if (seededTranslations) {
            for (const [key, value] of Object.entries(seededTranslations)) {
                if (!(key in nextTranslations)) {
                    nextTranslations[key] = value;
                    changed = true;
                }
            }
        }

        if (!changed) {
            unchangedCount++;
            return;
        }

        doc.translations = nextTranslations;
        doc.updatedTimeUtc = Date.now();
        await db.insertDoc(doc);
        updatedCount++;
    });

    for (const languageId of SEEDED_LANGUAGE_IDS) {
        if (!seenSeedLanguages.has(languageId)) {
            logger.warn(
                `Language translation seed reconciliation found no ${languageId} document to reconcile`,
            );
        }
    }

    logger.log(
        `Language translation seed reconciliation complete: ${updatedCount} updated, ${unchangedCount} unchanged`,
    );
}
