import Dexie from "dexie";
import { db } from "../db/database";
import { generateSearchTrigrams, normalizeText, stripHtml } from "./trigram";
import { getStoredFieldConfig } from "./ftsIndexer";
import type { FtsSearchOptions, FtsSearchResult } from "./types";

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_TRIGRAM_DOC_PERCENT = 50;

/**
 * Count how many of the query words appear as full words in the text.
 * Word order is ignored.
 */
function countWordMatches(queryWords: string[], docText: string): number {
    const docWords = new Set(docText.split(" "));
    let matches = 0;
    for (const word of queryWords) {
        if (docWords.has(word)) matches++;
    }
    return matches;
}

/**
 * Perform a full-text search against the FTS index.
 * Results are ranked by full-word matches first, then trigram score, then date.
 */
export async function ftsSearch(options: FtsSearchOptions): Promise<FtsSearchResult[]> {
    const {
        query,
        languageId,
        limit = DEFAULT_LIMIT,
        offset = 0,
        maxTrigramDocPercent = DEFAULT_MAX_TRIGRAM_DOC_PERCENT,
    } = options;

    const trigrams = generateSearchTrigrams(query);
    if (trigrams.length === 0) return [];

    // Get total indexed document count for percentage-based filtering
    const totalDocs = await db.ftsReverse.count();
    const maxDocCount = Math.max(1, Math.floor((totalDocs * maxTrigramDocPercent) / 100));

    // Frequency filter: check document count for each trigram and skip over-represented ones
    const usableTrigrams: string[] = [];
    for (const trigram of trigrams) {
        const count = await db.ftsIndex
            .where("[token+negPublishDate]")
            .between([trigram, Dexie.minKey], [trigram, Dexie.maxKey])
            .count();
        if (count <= maxDocCount) {
            usableTrigrams.push(trigram);
        }
    }

    if (usableTrigrams.length === 0) return [];

    // Aggregate results: count matching trigrams per docId
    const aggregation = new Map<
        string,
        { score: number; negPublishDate: number; parentId: string; language: string }
    >();

    for (const trigram of usableTrigrams) {
        const entries = await db.ftsIndex
            .where("[token+negPublishDate]")
            .between([trigram, Dexie.minKey], [trigram, Dexie.maxKey])
            .toArray();

        for (const entry of entries) {
            const existing = aggregation.get(entry.docId);
            if (existing) {
                existing.score++;
            } else {
                aggregation.set(entry.docId, {
                    score: 1,
                    negPublishDate: entry.negPublishDate,
                    parentId: entry.parentId,
                    language: entry.language,
                });
            }
        }
    }

    // Convert to array and optionally filter by language
    let results: FtsSearchResult[] = [];
    aggregation.forEach((data, docId) => {
        if (languageId && data.language !== languageId) return;
        results.push({
            docId,
            parentId: data.parentId,
            negPublishDate: data.negPublishDate,
            score: data.score,
            wordMatchScore: 0,
        });
    });

    // Full-word match scoring: load docs and count query word matches
    const normalizedQuery = normalizeText(query);
    const queryWords = normalizedQuery.split(" ").filter((w) => w.length > 2);

    if (queryWords.length > 0 && results.length > 0) {
        const fields = await getStoredFieldConfig();
        const docIds = results.map((r) => r.docId);
        const docs = await db.docs.where("_id").anyOf(docIds).toArray();
        const docMap = new Map(docs.map((d) => [d._id, d]));

        for (const result of results) {
            const doc = docMap.get(result.docId);
            if (!doc) continue;

            // Extract and normalize text from indexed fields
            const parts: string[] = [];
            if (fields) {
                for (const field of fields) {
                    const value = (doc as Record<string, any>)[field.name];
                    if (typeof value === "string" && value) {
                        parts.push(field.isHtml ? stripHtml(value) : value);
                    }
                }
            }
            const docText = normalizeText(parts.join(" "));
            result.wordMatchScore = countWordMatches(queryWords, docText);
        }
    }

    // Sort by word match score (desc), then trigram score (desc), then date (newest first)
    results.sort((a, b) => {
        if (b.wordMatchScore !== a.wordMatchScore) return b.wordMatchScore - a.wordMatchScore;
        if (b.score !== a.score) return b.score - a.score;
        return a.negPublishDate - b.negPublishDate;
    });

    // Apply pagination
    return results.slice(offset, offset + limit);
}
