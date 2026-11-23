import { ref } from "vue";
import { vi } from "vitest";
import {
    DocType,
    PublishStatus,
    type AccessMap,
    type BaseDocumentDto,
    type ContentDto,
    type DocDeletedByCommand,
    type HlsKeyOutcome,
} from "luminary-shared";
import type { DownloadEntry } from "@/build-time/contracts/downloads/contract";
import type { DownloadsDeps } from "../deps";

export const GROUP = "group-public";

export function grantAll(groups: string[] = [GROUP]): AccessMap {
    const all = { view: true, download: true };
    return Object.fromEntries(groups.map((g) => [g, { post: { ...all }, tag: { ...all } }]));
}

export function makeContent(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        _id: "content-1",
        type: DocType.Content,
        updatedTimeUtc: 1,
        parentId: "post-1",
        parentType: DocType.Post,
        language: "lang-eng",
        status: PublishStatus.Published,
        title: "Item one",
        slug: "item-one",
        publishDate: 1,
        memberOf: [GROUP],
        parentTags: [],
        parentMedia: { hlsUrl: "https://cdn.example.org/post-1/master.m3u8" },
        ...overrides,
    };
}

export function makeParent(id = "post-1", memberOf: string[] = [GROUP]): BaseDocumentDto {
    return { _id: id, type: DocType.Post, updatedTimeUtc: 1, memberOf };
}

export function makeEntry(overrides: Partial<DownloadEntry> = {}): DownloadEntry {
    return {
        downloadId: "d1",
        parentId: "post-1",
        parentType: "post",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
        status: "complete",
        reason: null,
        queuedAt: null,
        selection: { kind: "audio", audioLanguage: "en" },
        item: { state: "done", bytes: 10 },
        units: [
            { unitId: "u0", state: "done", bytes: 100 },
            { unitId: "u1", state: "done", bytes: 100 },
        ],
        chapters: [
            { title: "A", startTime: 0, endTime: 10, unitIds: ["u0"] },
            { title: "B", startTime: 10, endTime: 20, unitIds: ["u1"] },
        ],
        volumeId: "internal",
        encrypted: true,
        key: "present",
        expiresAt: null,
        revokedAt: null,
        lastSourceCheckAt: null,
        meteredConsent: false,
        content: {
            title: "Item one",
            contentId: "content-1",
            language: "lang-eng",
            memberOf: [GROUP],
            durationSeconds: 20,
        },
        ...overrides,
    };
}

/** Deps with an in-memory document store, pins and hooks the test drives. */
export function makeDeps(overrides: Partial<DownloadsDeps> = {}) {
    const docs = new Map<string, BaseDocumentDto>();
    const pins = new Set<string>();
    const deletedListeners = new Set<(deleted: DocDeletedByCommand[]) => void>();
    const docListeners = new Set<(parentIds: string[]) => void>();
    const foregroundListeners = new Set<() => void>();
    /** Remote translations by parent; a parent with none set answers with one live translation. */
    const translations = new Map<string, ContentDto[] | undefined>();
    const language = ref<string | undefined>("en");
    const accessMap = ref<AccessMap>(grantAll());
    const isConnected = ref(true);

    const deps = {
        now: () => Date.now(),
        accessMap,
        isConnected,
        getLocalDoc: vi.fn(async (id: string) => docs.get(id)) as DownloadsDeps["getLocalDoc"],
        getLocalTranslations: vi.fn(
            async (parentId: string) =>
                [...docs.values()].filter(
                    (doc) => doc.type === DocType.Content && doc.parentId === parentId,
                ) as ContentDto[],
        ),
        queryTranslations: vi.fn(async (parentId: string) =>
            translations.has(parentId)
                ? translations.get(parentId)
                : [makeContent({ parentId, _id: `${parentId}-content` })],
        ),
        fetchKey: vi.fn(async (): Promise<HlsKeyOutcome> => ({
            outcome: "key",
            keyHex: "ab".repeat(16),
        })),
        resolveSource: vi.fn(async (content: ContentDto) =>
            content.parentMedia?.hlsUrl
                ? {
                      masterUrl: content.parentMedia.hlsUrl,
                      keyHex: "ab".repeat(16),
                      artworkUrls: [],
                  }
                : undefined,
        ),
        pinRetention: vi.fn(
            async (ids: readonly string[]) => void ids.forEach((id) => pins.add(id)),
        ),
        unpinRetention: vi.fn(
            async (ids: readonly string[]) => void ids.forEach((id) => pins.delete(id)),
        ),
        getPinnedRetentionIds: vi.fn(async () => [...pins]),
        onDocsDeletedByCommand: (listener: (deleted: DocDeletedByCommand[]) => void) => {
            deletedListeners.add(listener);
            return () => void deletedListeners.delete(listener);
        },
        watchDocs: (_ids: () => readonly string[], listener: (parentIds: string[]) => void) => {
            docListeners.add(listener);
            return () => void docListeners.delete(listener);
        },
        onForeground: (listener: () => void) => {
            foregroundListeners.add(listener);
            return () => void foregroundListeners.delete(listener);
        },
        // Every key "translates" to itself with a marker, so tests can tell a text was looked up.
        translator: () => ({ t: (key: string) => `t:${key}` }),
        languageKey: () => language.value,
        notify: vi.fn(),
        navigate: vi.fn(),
        reportError: vi.fn(),
        ...overrides,
    } satisfies DownloadsDeps;

    return {
        deps,
        docs,
        pins,
        translations,
        language,
        accessMap,
        isConnected,
        deleteByCommand: (deleted: DocDeletedByCommand[]) =>
            deletedListeners.forEach((listener) => listener(deleted)),
        docsWritten: (parentIds: string[]) =>
            docListeners.forEach((listener) => listener(parentIds)),
        foreground: () => foregroundListeners.forEach((listener) => listener()),
    };
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
