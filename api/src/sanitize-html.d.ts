declare module "sanitize-html" {
    namespace sanitizeHtml {
        interface IOptions {
            allowedTags?: string[];
            allowedAttributes?: Record<string, string[]>;
            allowedClasses?: Record<string, Array<string | RegExp>>;
            allowedSchemes?: string[];
            allowProtocolRelative?: boolean;
            nonTextTags?: string[];
            transformTags?: Record<
                string,
                (
                    tagName: string,
                    attribs: Record<string, string>,
                ) => { tagName: string; attribs: Record<string, string> }
            >;
        }
    }
    function sanitizeHtml(html: string, options?: sanitizeHtml.IOptions): string;
    export = sanitizeHtml;
}
