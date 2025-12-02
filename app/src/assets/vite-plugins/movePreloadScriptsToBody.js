/**
 * Vite plugin that moves JavaScript preload script tags from <head> to <body>
 * This defers script preloading until the body is parsed, improving initial page load speed.
 */
export default function movePreloadScriptsToBody() {
    return {
        name: "move-preload-scripts-to-body",
        apply: "build", // Only apply during build, not dev
        transformIndexHtml: {
            enforce: "post", // Run after other HTML transformations
            transform(html) {
                // Match all JavaScript-related tags that should be moved to body:
                // 1. Preload script tags (modulepreload and preload with as="script")
                // 2. Script tags with type="module" (handles both self-closing and with content)
                const preloadScriptRegex =
                    /<link[^>]*(?:rel\s*=\s*["']modulepreload["']|(?:rel\s*=\s*["']preload["'][^>]*as\s*=\s*["']script["']|as\s*=\s*["']script["'][^>]*rel\s*=\s*["']preload["']))[^>]*\/?>/gi;
                const moduleScriptRegex =
                    /<script[^>]*type\s*=\s*["']module["'][^>]*(?:\/>|>.*?<\/script>)/gi;

                const scriptsToMove = [];
                let match;

                // Reset regex lastIndex to avoid issues with multiple calls
                preloadScriptRegex.lastIndex = 0;
                moduleScriptRegex.lastIndex = 0;

                // Find all preload script tags
                while ((match = preloadScriptRegex.exec(html)) !== null) {
                    if (match[0]) {
                        scriptsToMove.push(match[0]);
                    }
                }

                // Find all module script tags
                while ((match = moduleScriptRegex.exec(html)) !== null) {
                    if (match[0]) {
                        scriptsToMove.push(match[0]);
                    }
                }

                if (scriptsToMove.length === 0) {
                    return html;
                }

                // Remove scripts from the HTML
                let modifiedHtml = html;
                scriptsToMove.forEach((script) => {
                    // Escape special regex characters
                    const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    // Remove the tag with optional whitespace/newlines around it
                    const regex = new RegExp(`\\s*${escaped}\\s*`, "g");
                    modifiedHtml = modifiedHtml.replace(regex, "");
                });

                // Add scripts to body (before closing </body> tag)
                // Match the indentation of the body content (typically 8 spaces)
                const bodyMatch = modifiedHtml.match(/(\s*)<\/body>/i);
                if (bodyMatch) {
                    const bodyIndent = bodyMatch[1] || "        ";
                    // Use the same indentation as body content
                    const scriptsToAdd = scriptsToMove
                        .map((script) => `${bodyIndent}${script.trim()}`)
                        .join("\n");
                    modifiedHtml = modifiedHtml.replace(
                        /(\s*)<\/body>/i,
                        `\n${scriptsToAdd}\n$1</body>`,
                    );
                } else {
                    // Fallback: append before </html> if no body tag found
                    const scriptsToAdd = scriptsToMove
                        .map((script) => `        ${script.trim()}`)
                        .join("\n");
                    modifiedHtml = modifiedHtml.replace(
                        /(\s*)<\/html>/i,
                        `\n${scriptsToAdd}\n$1</html>`,
                    );
                }

                return modifiedHtml;
            },
        },
    };
}
