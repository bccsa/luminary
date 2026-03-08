/**
 * HTML entity map for common named entities
 */
const HTML_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
};

/**
 * Strip HTML tags from a string using a linear scan state-machine parser.
 * Handles script/style blocks, HTML comments, and common HTML entities.
 * O(n) single-pass, no regex backtracking. Works in Web Workers (no DOM dependency).
 */
export function stripHtml(html: string): string {
    if (!html) return "";

    const len = html.length;
    const result: string[] = [];
    let i = 0;
    let inTag = false;
    let inScript = false;
    let inStyle = false;
    let inComment = false;

    while (i < len) {
        if (inComment) {
            // Look for end of comment -->
            if (html[i] === "-" && html[i + 1] === "-" && html[i + 2] === ">") {
                inComment = false;
                i += 3;
            } else {
                i++;
            }
        } else if (inScript) {
            // Look for </script>
            if (
                html[i] === "<" &&
                html[i + 1] === "/" &&
                html.substring(i + 2, i + 8).toLowerCase() === "script" &&
                html[i + 8] === ">"
            ) {
                inScript = false;
                i += 9;
            } else {
                i++;
            }
        } else if (inStyle) {
            // Look for </style>
            if (
                html[i] === "<" &&
                html[i + 1] === "/" &&
                html.substring(i + 2, i + 7).toLowerCase() === "style" &&
                html[i + 7] === ">"
            ) {
                inStyle = false;
                i += 8;
            } else {
                i++;
            }
        } else if (inTag) {
            if (html[i] === ">") {
                inTag = false;
                result.push(" ");
            }
            i++;
        } else if (html[i] === "<") {
            // Check for comment
            if (html[i + 1] === "!" && html[i + 2] === "-" && html[i + 3] === "-") {
                inComment = true;
                i += 4;
            }
            // Check for script tag
            else if (html.substring(i + 1, i + 7).toLowerCase() === "script") {
                inScript = true;
                i += 7;
            }
            // Check for style tag
            else if (html.substring(i + 1, i + 6).toLowerCase() === "style") {
                inStyle = true;
                i += 6;
            } else {
                inTag = true;
                i++;
            }
        } else if (html[i] === "&") {
            // Decode HTML entity
            const semicolonIdx = html.indexOf(";", i + 1);
            if (semicolonIdx !== -1 && semicolonIdx - i <= 8) {
                const entity = html.substring(i + 1, semicolonIdx);
                if (entity[0] === "#") {
                    // Numeric entity: &#123; or &#x1A;
                    const code =
                        entity[1] === "x"
                            ? parseInt(entity.substring(2), 16)
                            : parseInt(entity.substring(1), 10);
                    if (!isNaN(code)) {
                        result.push(String.fromCharCode(code));
                        i = semicolonIdx + 1;
                        continue;
                    }
                } else if (HTML_ENTITIES[entity]) {
                    result.push(HTML_ENTITIES[entity]);
                    i = semicolonIdx + 1;
                    continue;
                }
            }
            result.push(html[i]);
            i++;
        } else {
            result.push(html[i]);
            i++;
        }
    }

    return result.join("");
}

/**
 * Normalize text for trigram generation.
 * Lowercases, strips diacritics, and collapses whitespace.
 */
export function normalizeText(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Generate unique trigrams from text.
 * Skips words of 2 characters or less (language-agnostic filter).
 * Caps text at 5000 characters to limit index size on low-end devices.
 */
export function generateTrigrams(text: string): Set<string> {
    const trigrams = new Set<string>();
    const normalized = normalizeText(text);
    if (!normalized) return trigrams;

    // Cap at 5000 chars to protect low-end devices
    const capped = normalized.length > 5000 ? normalized.substring(0, 5000) : normalized;
    const words = capped.split(" ");

    for (const word of words) {
        if (word.length <= 2) continue;
        for (let i = 0; i <= word.length - 3; i++) {
            trigrams.add(word.substring(i, i + 3));
        }
    }

    return trigrams;
}

/**
 * Generate trigrams from a search query. Returns an array (not set)
 * so that duplicate trigrams can be used for scoring.
 * No character cap since queries are short.
 */
export function generateSearchTrigrams(query: string): string[] {
    const normalized = normalizeText(query);
    if (!normalized) return [];

    const trigrams: string[] = [];
    const seen = new Set<string>();
    const words = normalized.split(" ");

    for (const word of words) {
        if (word.length <= 2) continue;
        for (let i = 0; i <= word.length - 3; i++) {
            const trigram = word.substring(i, i + 3);
            if (!seen.has(trigram)) {
                seen.add(trigram);
                trigrams.push(trigram);
            }
        }
    }

    return trigrams;
}
