import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { DbService } from "./db.service";
import { LanguageDto } from "../dto/LanguageDto";
import { DocType } from "../enums";

const logger = new Logger("LanguageTranslationSeedReconciliation");

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

// Discover every `lang-*.json` in the seeding directory rather than hardcoding the set.
// Each filename stem is the language doc _id it seeds (lang-eng.json → lang-eng), so adding
// a new language seed file is picked up automatically here — no code change needed.
export function readSeedLanguageTranslations(
    seedDir = path.join(__dirname, "seedingDocs"),
): Record<string, Record<string, string>> {
    const seedTranslations: Record<string, Record<string, string>> = {};
    for (const file of fs.readdirSync(seedDir)) {
        if (!file.startsWith("lang-") || !file.endsWith(".json")) continue;
        const languageId = path.basename(file, ".json");
        seedTranslations[languageId] = readTranslations(seedDir, file);
    }
    return seedTranslations;
}

// Compute a language's reconciled translations: prune keys no seed file defines, keep existing
// allowed values, and backfill every missing allowed key — taking the language's own seed value
// when it has one, otherwise drawing from `fallback`. Never leaves a missing allowed key, so no
// raw i18n key reaches clients. Pure: does not mutate `doc`.
function reconcileTranslations(
    doc: LanguageDto,
    allowedKeys: Set<string>,
    ownSeedTranslations: Record<string, string> | undefined,
    fallback: Record<string, string>,
): { translations: Record<string, string>; changed: boolean } {
    const currentTranslations = isTranslationsMap(doc.translations) ? doc.translations : {};
    const nextTranslations: Record<string, string> = {};
    let changed = false;

    for (const [key, value] of Object.entries(currentTranslations)) {
        if (allowedKeys.has(key)) {
            nextTranslations[key] = value;
        } else {
            changed = true;
        }
    }

    for (const key of allowedKeys) {
        if (key in nextTranslations) continue;
        if (ownSeedTranslations && key in ownSeedTranslations) {
            nextTranslations[key] = ownSeedTranslations[key];
        } else {
            nextTranslations[key] = fallback[key];
        }
        changed = true;
    }

    return { translations: nextTranslations, changed };
}

export async function reconcileLanguageTranslationSeeds(
    db: DbService,
    seedTranslations: Record<string, Record<string, string>> = readSeedLanguageTranslations(),
) {
    const seededLanguageIds = Object.keys(seedTranslations);

    // allowedKeys is the union of every key defined by ANY seed file. A key is pruned from a
    // language only if no seed file defines it, so a key added to a single new seed language is
    // kept everywhere instead of being silently stripped from the others.
    const allowedKeys = new Set<string>();
    for (const translations of Object.values(seedTranslations)) {
        for (const key of Object.keys(translations)) {
            allowedKeys.add(key);
        }
    }

    // Collect every language doc up front so the default language can be reconciled first — its
    // translations are the placeholder every other language backfills missing keys from.
    const docs: LanguageDto[] = [];
    await db.processAllDocs([DocType.Language], async (doc: LanguageDto) => {
        docs.push(doc);
    });

    const defaultDoc = docs.find((doc) => doc.default === 1);

    // mergedSeedFallback is the complete placeholder source used to reconcile the default
    // language itself (which can't fall back to its own translations). It merges every seed file,
    // preferring the default language's seed file when it has one, then the rest in a
    // deterministic alphabetical order. The union of seed files covers every allowed key, so this
    // is always complete.
    const fallbackOrder = defaultDoc
        ? [defaultDoc._id, ...seededLanguageIds.filter((id) => id !== defaultDoc._id).sort()]
        : [...seededLanguageIds].sort();
    const mergedSeedFallback: Record<string, string> = {};
    for (const languageId of fallbackOrder) {
        const translations = seedTranslations[languageId];
        if (!translations) continue;
        for (const [key, value] of Object.entries(translations)) {
            if (!(key in mergedSeedFallback)) mergedSeedFallback[key] = value;
        }
    }

    // Reconcile the default language first so its translations can serve as the placeholder for
    // every other language. If there's no default language doc in the DB, fall back to the merged
    // seed values directly and warn — placeholders can't track a default that isn't there.
    let defaultTranslations: Record<string, string>;
    if (defaultDoc) {
        defaultTranslations = reconcileTranslations(
            defaultDoc,
            allowedKeys,
            seedTranslations[defaultDoc._id],
            mergedSeedFallback,
        ).translations;
    } else {
        defaultTranslations = mergedSeedFallback;
        logger.warn(
            "Language translation seed reconciliation found no default language document (default: 1); using merged seed values as placeholders",
        );
    }

    const seenSeedLanguages = new Set<string>();
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const doc of docs) {
        if (doc._id in seedTranslations) {
            seenSeedLanguages.add(doc._id);
        }

        // The default language reconciles against the merged seed fallback; every other language
        // reconciles against the default language's translations, so its placeholders match what
        // the default language actually shows users.
        const fallback = doc.default === 1 ? mergedSeedFallback : defaultTranslations;
        const { translations, changed } = reconcileTranslations(
            doc,
            allowedKeys,
            seedTranslations[doc._id],
            fallback,
        );

        if (!changed) {
            unchangedCount++;
            continue;
        }

        doc.translations = translations;
        doc.updatedTimeUtc = Date.now();
        await db.insertDoc(doc);
        updatedCount++;
    }

    for (const languageId of seededLanguageIds) {
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