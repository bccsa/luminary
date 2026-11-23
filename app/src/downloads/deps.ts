import type { Ref } from "vue";
import {
    AclPermission,
    DocType,
    type AccessMap,
    type BaseDocumentDto,
    type ContentDto,
    type DocDeletedByCommand,
    type HlsKeyOutcome,
} from "luminary-shared";
import type { DownloadSource } from "@/build-time/contracts/downloads/contract";
import type { Translator } from "./texts";

/**
 * Everything the downloads service reaches outside the engine. The app supplies the real ones; tests supply their
 * own, so the service's rules run without a database, a socket or a server.
 */
export type DownloadsDeps = {
    now(): number;
    accessMap: Readonly<Ref<AccessMap>>;
    /** The socket is connected: remote checks have a chance of an answer. */
    isConnected: Readonly<Ref<boolean>>;
    /** A document from the device's own store; undefined when it is not there. */
    getLocalDoc<T extends BaseDocumentDto = BaseDocumentDto>(id: string): Promise<T | undefined>;
    /** The translations of a parent in the device's own store. */
    getLocalTranslations(parentId: string): Promise<ContentDto[]>;
    /**
     * Every translation of a parent the viewer may view, expired ones included, from one remote query. Undefined
     * when there was no successful answer. An empty list alone never deletes a download.
     */
    queryTranslations(parentId: string): Promise<ContentDto[] | undefined>;
    fetchKey(parentId: string): Promise<HlsKeyOutcome>;
    /** Where a content's media is, for the engine; undefined when it has none to download. */
    resolveSource(content: ContentDto): Promise<DownloadSource | undefined>;
    pinRetention(ids: readonly string[]): Promise<void>;
    unpinRetention(ids: readonly string[]): Promise<void>;
    getPinnedRetentionIds(): Promise<string[]>;
    onDocsDeletedByCommand(listener: (deleted: DocDeletedByCommand[]) => void): () => void;
    /**
     * Reports stored documents among `ids` (or whose parent is among them) being written. A document leaving the
     * store is not reported: local clean-up removes documents too, and says nothing about the server.
     */
    watchDocs(ids: () => readonly string[], listener: (parentIds: string[]) => void): () => void;
    /** The app came back to the foreground. */
    onForeground(listener: () => void): () => void;
    /** The app's words; undefined until the language is loaded. */
    translator(): Translator | undefined;
    /** Changes whenever the app's language does; read inside a watcher. */
    languageKey(): string | undefined;
    /** A short message to the viewer outside the native player. */
    notify(text: string, state?: "info" | "error"): void;
    navigate(path: string): void;
    reportError(error: unknown, op: string): void;
};

/** Whether `groups` grant `permission` on `docType` in `map`. */
export function grants(
    map: AccessMap,
    groups: readonly string[],
    docType: DocType,
    permission: AclPermission,
): boolean {
    return groups.some((group) => map[group]?.[docType]?.[permission] === true);
}

/** Viewing and downloading are both granted for a parent with these groups. */
export function mayDownload(
    map: AccessMap,
    groups: readonly string[],
    parentType: "post" | "tag",
): boolean {
    const docType = parentType === "tag" ? DocType.Tag : DocType.Post;
    return (
        grants(map, groups, docType, AclPermission.View) &&
        grants(map, groups, docType, AclPermission.Download)
    );
}

export function isAccessMapLoaded(map: AccessMap): boolean {
    return Object.keys(map).length > 0;
}
