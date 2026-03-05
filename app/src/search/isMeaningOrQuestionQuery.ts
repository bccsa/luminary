/**
 * Heuristic: does the query look like "meaning of X", "what is Y", or a question?
 * Used to decide when to show the AI answer box on the search results page.
 */
const MEANING_PATTERNS = [
    /\bmeaning\s+of\b/i,
    /\bwhat\s+is\b/i,
    /\bwhat\s+are\b/i,
    /\bdefine\b/i,
    /\bdefinition\s+of\b/i,
    /\bwho\s+is\b/i,
    /\bexplain\b/i,
    /\bexplanation\s+of\b/i,
];

export function isMeaningOrQuestionQuery(query: string): boolean {
    const trimmed = query.trim();
    if (!trimmed) return false;
    if (trimmed.endsWith("?")) return true;
    return MEANING_PATTERNS.some((re) => re.test(trimmed));
}
