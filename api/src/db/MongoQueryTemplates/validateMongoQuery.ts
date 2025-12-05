import * as fs from "fs";
import * as path from "path";

// Use require for sanitize-filename to avoid import issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sanitize = require("sanitize-filename");

type ValidationResult = {
    valid: boolean;
    error: string;
};

// Cache for validated templates, keyed by identifier
const templateCache = new Map<string, any>();

/**
 * Verify a Mongo/Mango query against a template JSON identified by query.identifier.
 * - Template fields with function-string values (e.g. "(val) => typeof val === 'number'")
 *   are compiled and executed against the provided query value.
 * - Template fields with static values must match exactly in the provided query (strict equality / deep equal).
 * - All fields in the template must be present in the query.
 * - Extra fields not in the template are rejected to prevent unauthorized data mining.
 *
 * Note: Templates are looked up as <identifier>.js in the templatesDir.
 * Successfully loaded and verified templates are cached for improved performance.
 */
export function validateMongoQuery(
    query: any,
    templatesDir = path.resolve(__dirname),
): ValidationResult {
    const identifier = query?.identifier;
    if (!identifier || typeof identifier !== "string") {
        return {
            valid: false,
            error: "Missing or invalid 'identifier' on query. Expected a string matching <identifier>.json template.",
        };
    }

    // Sanitize the identifier to prevent directory traversal or code injection
    const safeIdentifier = sanitize(identifier);

    // Ensure the identifier doesn't contain path separators after sanitization
    if (
        safeIdentifier.includes(path.sep) ||
        safeIdentifier.includes("/") ||
        safeIdentifier.includes("\\")
    ) {
        return {
            valid: false,
            error: `Invalid identifier '${identifier}': path separators not allowed`,
        };
    }

    // Check cache first for already validated templates
    if (templateCache.has(safeIdentifier)) {
        const template = templateCache.get(safeIdentifier);
        // Remove identifier field from query before validation
        delete query.identifier;
        return validate(query, template);
    }

    // Resolve the templates directory to get the absolute canonical path
    const resolvedTemplatesDir = fs.realpathSync(templatesDir);

    // Try to resolve a JavaScript/TypeScript template first
    let template: any = undefined;
    const jsCandidates = [
        path.resolve(resolvedTemplatesDir, "validators", `${safeIdentifier}.ts`),
        path.resolve(resolvedTemplatesDir, "validators", `${safeIdentifier}.js`),
        path.resolve(resolvedTemplatesDir, `${safeIdentifier}.js`),
    ];
    for (const p of jsCandidates) {
        try {
            if (fs.existsSync(p)) {
                // Verify the resolved path is within the templates directory
                const resolvedPath = fs.realpathSync(p);
                if (
                    !resolvedPath.startsWith(resolvedTemplatesDir + path.sep) &&
                    resolvedPath !== resolvedTemplatesDir
                ) {
                    return {
                        valid: false,
                        error: `Security violation: template path outside templates directory`,
                    };
                }

                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const mod = require(resolvedPath);
                template = mod?.default ?? mod;
                break;
            }
        } catch (e) {
            // If require fails (e.g., ESM syntax), ignore and continue to JSON fallback
        }
    }

    // If no JavaScript template found, bail out
    if (template === undefined) {
        return {
            valid: false,
            error: `Template not found for identifier '${identifier}'`,
        };
    }

    // Cache the successfully loaded and verified template
    templateCache.set(safeIdentifier, template);

    // Remove identifier field
    delete query.identifier;

    return validate(query, template);
}

function validate(object: any, template: any): { valid: boolean; error: string } {
    if (typeof template === "string") {
        if (isFunctionString(template)) {
            // Support function-string validators from JSON templates
            try {
                const fixed = template.replace(/\.each\(/g, ".every(");
                // eslint-disable-next-line no-new-func
                const fn = new Function(`return (${fixed});`)();
                const valid = typeof fn === "function" ? !!fn(object) : false;
                return { valid, error: valid ? "" : "Function-string validation failed" };
            } catch (e: any) {
                return { valid: false, error: "Function-string validation failed" };
            }
        }
    }

    // Support real function validators from JavaScript templates
    if (typeof template === "function") {
        try {
            const ok = !!template(object);
            return { valid: ok, error: ok ? "" : "Function validation failed" };
        } catch (e: any) {
            return { valid: false, error: "Function validation failed" };
        }
    }

    if (typeof template === "object") {
        // Handle arrays
        if (Array.isArray(template)) {
            if (!Array.isArray(object) || object.length !== template.length) {
                return { valid: false, error: "Array structure mismatch" };
            }
            for (let i = 0; i < template.length; i++) {
                const result = validate(object[i], template[i]);
                if (!result.valid) {
                    return { valid: false, error: result.error };
                }
            }
            return { valid: true, error: "" };
        }

        // Iterate object keys
        for (const key of Object.keys(template)) {
            if (!(key in object)) return { valid: false, error: `Missing key '${key}' in object` };
            const result = validate(object[key], template[key]);
            if (!result.valid) return { valid: false, error: result.error };
        }

        // Check for extra keys in object not in template to prevent unauthorized queries
        for (const key of Object.keys(object)) {
            if (!(key in template))
                return { valid: false, error: `Extra key '${key}' found in object` };
        }

        return { valid: true, error: "" };
    }
    // Primitive value - must match exactly
    const valid = object === template;
    return {
        valid,
        error: valid ? "" : `Expected ${JSON.stringify(template)}, got ${JSON.stringify(object)}`,
    };
}

function isFunctionString(val: unknown): val is string {
    if (typeof val !== "string") return false;
    const s = val.trim();
    // Match common arrow function forms like "(val) => ..." or "val => ..."
    return /^(\(\s*\w+\s*\)|\w+)\s*=>/.test(s);
}

export default validateMongoQuery;
