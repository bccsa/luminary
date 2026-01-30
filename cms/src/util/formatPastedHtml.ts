/**
 * A helper function to format pasted html into readable text for the user
 * and headings we support with our text editor component
 * @param html the html data to parse
 * @returns the parsed html ready for use
 */

export default function formatPastedHtml(html: string) {
    html = html
        .trim() // Remove leading and trailing whitespace first
        .replace(/[\r\n\u2028\u2029]+/g, " ") // Remove all line breaks that get added by text editors like word before processing
        .replace(/\u00AD/g, "") // remove soft hyphens
        .replace(/>\s+</g, "><") // Remove spaces between tags
        .replace(/<br\s*\/?>/gi, "") // Remove standalone <br>
        .replace(/<p>\s*<\/p>/gi, "") // Remove empty paragraphs
        .replace(/&nbsp;/g, " ") // Clean non breaking spaces
        .replace(/^\s+|\s+$/g, ""); // Remove leading and trailing whitespace after all processing

    // Convert Word Online style-based formatting to semantic HTML tags
    // Word Online uses inline styles instead of semantic tags like <strong> and <em>
    html = convertWordOnlineStylesToSemanticHtml(html);

    // Only demote headings when an h1 is present to preserve hierarchy. The editor supports h2-h5.
    if (/<h1/i.test(html)) {
        html = html
            .replace(/<h([1-6])([^>]*)>/gi, (_, level, attrs) => {
                const newLevel = Math.min(parseInt(level) + 1, 6);
                return `<h${newLevel}${attrs}>`;
            })
            .replace(/<\/h([1-6])>/gi, (_, level) => {
                const newLevel = Math.min(parseInt(level) + 1, 6);
                return `</h${newLevel}>`;
            });
    }

    // Convert any non-supported headings (h6-h9) to paragraphs to preserve their content.
    return html
        .replace(/<h([6-9]|\d{2,})([^>]*)>/gi, "<p$2>")
        .replace(/<\/h([6-9]|\d{2,})>/gi, "</p>")
        .trim(); // Remove leading and trailing whitespace
}

/**
 * Convert Word Online's style-based formatting to semantic HTML tags.
 * Word Online uses spans with inline styles (font-weight: bold, font-style: italic)
 * instead of semantic tags like <strong> and <em>.
 */
function convertWordOnlineStylesToSemanticHtml(html: string): string {
    // Process bold spans: <span style="...font-weight: bold...">text</span> -> <strong>text</strong>
    // Also handles font-weight: 700 or higher numeric values
    html = html.replace(
        /<span[^>]*style="[^"]*font-weight:\s*(bold|[7-9]\d{2})[^"]*"[^>]*>(.*?)<\/span>/gi,
        (match, _weight, content) => {
            // Check if there's also italic styling
            if (/font-style:\s*italic/i.test(match)) {
                return `<strong><em>${content}</em></strong>`;
            }
            return `<strong>${content}</strong>`;
        },
    );

    // Process italic spans: <span style="...font-style: italic...">text</span> -> <em>text</em>
    html = html.replace(
        /<span[^>]*style="[^"]*font-style:\s*italic[^"]*"[^>]*>(.*?)<\/span>/gi,
        (match, content) => {
            // Skip if already processed as bold+italic
            if (/font-weight:\s*(bold|[7-9]\d{2})/i.test(match)) {
                return match;
            }
            return `<em>${content}</em>`;
        },
    );

    // Process underline spans: <span style="...text-decoration: underline...">text</span> -> <u>text</u>
    html = html.replace(
        /<span[^>]*style="[^"]*text-decoration:\s*underline[^"]*"[^>]*>(.*?)<\/span>/gi,
        "<u>$1</u>",
    );

    // Process strikethrough spans: <span style="...text-decoration: line-through...">text</span> -> <s>text</s>
    html = html.replace(
        /<span[^>]*style="[^"]*text-decoration:\s*line-through[^"]*"[^>]*>(.*?)<\/span>/gi,
        "<s>$1</s>",
    );

    // Remove remaining empty or style-only spans that don't contain meaningful formatting
    html = html.replace(/<span[^>]*>(.*?)<\/span>/gi, "$1");

    // Remove MSO-specific classes and styles
    html = html.replace(/\s*class="Mso[^"]*"/gi, "");
    html = html.replace(/\s*style="[^"]*mso-[^"]*"/gi, "");

    // Clean up any remaining style attributes that only contain mso- properties
    html = html.replace(/\s*style="[^"]*"/gi, (match) => {
        // Keep the style if it has non-mso properties we care about
        if (/font-weight|font-style|text-decoration/i.test(match)) {
            return match;
        }
        return "";
    });

    return html;
}
