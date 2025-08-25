/**
 * A helper function to format pasted html into readable text for the user
 * and headings we support with our text editor component
 * @param html the html data to parse
 * @returns the parsed html ready for use
 */

export default function formatPastedHtml(html: string) {
    html = html
        .replace(/[\r\n\u2028\u2029]+/g, "") // Remove all line breaks that get added by text editors like word before processing
        .replace(/\u00AD/g, "")
        .replace(/>\s+</g, "><") // Remove spaces between tags
        .replace(/<br\s*\/?>/gi, "") // Remove standalone <br>
        .replace(/<p>\s*<\/p>/gi, "") // Remove empty paragraphs
        .replace(/&nbsp;/g, " "); // Clean non breaking spaces

    //Only patch headings when an h1 is present
    if (html.includes("<h1>")) {
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

    // Convert <h6> headings to normal text as we don't support it.
    if (html.includes("h6")) {
        html = html.replace(/<h6>/gi, "").replace(/<\/h6>/gi, "");
    }

    return html;
}
