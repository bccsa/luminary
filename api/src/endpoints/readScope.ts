import { AclPermission, DocType } from "../enums";

/**
 * Internal read options for QueryService / FtsSearchService. Only the MCP server passes them;
 * they are never read from a request body.
 */
export type ReadOptions = {
    /**
     * MCP read mode: CMS visibility (drafts, scheduled and expired docs) gated by McpView
     * instead of CmsView.
     */
    mcp?: boolean;
};

/** The permission that gates a read: McpView for MCP, CmsView for CMS-scoped reads, else View. */
export function readPermission(cms: boolean, options: ReadOptions = {}): AclPermission {
    if (options.mcp) return AclPermission.McpView;
    return cms ? AclPermission.CmsView : AclPermission.View;
}

/**
 * Doc types that can be read by id in a CMS-scoped mode. Internal types (Crypto, Sidecar,
 * DeleteCmd, Change) are deliberately absent.
 */
export const READABLE_DOC_TYPES: DocType[] = [
    DocType.Post,
    DocType.Tag,
    DocType.Content,
    DocType.Language,
    DocType.Redirect,
    DocType.Group,
    DocType.User,
    DocType.Storage,
    DocType.AuthProvider,
    DocType.AutoGroupMappings,
    DocType.DefaultAffinity,
];
