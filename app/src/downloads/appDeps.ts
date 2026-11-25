import { effectScope, watch, type App } from "vue";
import type { Router } from "vue-router";
import { liveQuery } from "dexie";
import {
    accessMap,
    db,
    DocType,
    fetchHlsKeyOutcome,
    getPinnedRetentionIds,
    isConnected,
    onDocsDeletedByCommand,
    pinRetention,
    PublishStatus,
    queryRemoteOutcome,
    reportError,
    toAbsoluteMediaUrl,
    unpinRetention,
    type BaseDocumentDto,
    type ContentDto,
    type StorageDto,
} from "luminary-shared";
import type { DownloadSource } from "@/build-time/contracts/downloads/contract";
import { appLanguageAsRef } from "@/globalConfig";
import { ensureFreshToken } from "@/auth";
import { useNotificationStore } from "@/stores/notification";
import { shareImageUrl } from "@/composables/useSocialShare";
import type { DownloadsDeps } from "./deps";
import { hasDownloadableMedia } from "./content";
import type { Translator } from "./texts";

/** The encoder writes chapters in this one language, beside the master playlist. */
const CHAPTERS_LANGUAGE = "en";

async function localDoc<T extends BaseDocumentDto>(id: string | undefined): Promise<T | undefined> {
    if (!id) return undefined;
    return (await db.docs.get(id)) as T | undefined;
}

async function localTranslations(parentId: string): Promise<ContentDto[]> {
    const docs = (await db.docs.where("parentId").equals(parentId).toArray()) as ContentDto[];
    return docs.filter((doc) => doc.type === DocType.Content);
}

/** A published translation of the parent that is still within its dates is on the device. */
async function hasLocalLiveTranslation(parentId: string, now: number): Promise<boolean> {
    return (await localTranslations(parentId)).some(
        (doc) =>
            doc.status === PublishStatus.Published &&
            (typeof doc.expiryDate !== "number" || doc.expiryDate > now),
    );
}

/**
 * One remote query for every translation of a parent, expired ones included. Only a successful answer, asked and
 * answered while connected, is an answer; an empty one while the device holds a live translation is not passed on,
 * since a translation the viewer has offline is still left.
 */
async function queryTranslations(parentId: string): Promise<ContentDto[] | undefined> {
    if (!isConnected.value) return undefined;
    const outcome = await queryRemoteOutcome<ContentDto>({
        selector: { type: DocType.Content, parentId },
        $sort: [{ publishDate: "desc" }],
        use_index: "content-parentId-publishDate-index",
        includeExpired: true,
        identifier: "downloads",
    });
    if (!outcome.ok || !isConnected.value) return undefined;
    if (outcome.docs.length === 0 && (await hasLocalLiveTranslation(parentId, Date.now())))
        return undefined;
    return outcome.docs;
}

async function resolveSource(content: ContentDto): Promise<DownloadSource | undefined> {
    if (!hasDownloadableMedia(content)) return undefined;
    const mediaBucket = await localDoc<StorageDto>(content.parentMediaBucketId);
    const masterUrl = toAbsoluteMediaUrl(content.parentMedia?.hlsUrl, mediaBucket?.publicUrl);
    if (!masterUrl) return undefined;

    let keyHex: string | undefined;
    if (content.parentMedia?.hlsKey_id) {
        await ensureFreshToken();
        const outcome = await fetchHlsKeyOutcome(content.parentId);
        if (outcome.outcome !== "key") throw new Error(`hls key: ${outcome.outcome}`);
        keyHex = outcome.keyHex;
    }

    const path = masterUrl.split(/[?#]/)[0] ?? masterUrl;
    const folder = path.slice(0, path.lastIndexOf("/"));
    const imageBucket = await localDoc<StorageDto>(content.parentImageBucketId);
    const artwork = shareImageUrl(content, imageBucket?.publicUrl);
    return {
        masterUrl,
        ...(keyHex ? { keyHex } : {}),
        chaptersUrl: `${folder}/chapters/${CHAPTERS_LANGUAGE}.vtt`,
        thumbnailsUrl: `${folder}/thumbnails/thumbnails.vtt`,
        waveformUrl: `${folder}/waveform.json`,
        artworkUrls: artwork ? [artwork] : [],
    };
}

/** Reports parents whose stored parent doc or content docs were written; a doc leaving the store is not a write. */
function watchDocs(ids: () => readonly string[], listener: (parentIds: string[]) => void) {
    const scope = effectScope(true);
    let subscription: { unsubscribe(): void } | undefined;
    scope.run(() =>
        watch(
            () => [...new Set(ids())].sort().join("\n"),
            (key) => {
                subscription?.unsubscribe();
                subscription = undefined;
                const parentIds = key ? key.split("\n") : [];
                if (parentIds.length === 0) return;
                let seen: Map<string, string> | undefined;
                subscription = liveQuery(async () => {
                    const [children, parents] = await Promise.all([
                        db.docs.where("parentId").anyOf(parentIds).toArray(),
                        db.docs.bulkGet(parentIds),
                    ]);
                    return [...children, ...parents].filter(Boolean) as BaseDocumentDto[];
                }).subscribe({
                    next(docs) {
                        const now = new Map(
                            docs.map((d) => [d._id, `${d.parentId ?? d._id}\n${d.updatedTimeUtc}`]),
                        );
                        const before = seen;
                        seen = now;
                        if (!before) return;
                        const changed = new Set<string>();
                        for (const [id, sig] of now) {
                            if (before.get(id) !== sig) changed.add(sig.split("\n")[0]);
                        }
                        if (changed.size) listener([...changed]);
                    },
                    error(error) {
                        reportError(error, { area: "downloads", op: "watch-docs" });
                    },
                });
            },
            { immediate: true },
        ),
    );
    return () => {
        subscription?.unsubscribe();
        scope.stop();
    };
}

/** The app's own sources for everything the downloads service needs beyond the engine. */
export function createAppDeps(options: { app: App; router: Router }): DownloadsDeps {
    const { app, router } = options;
    const globals = app.config.globalProperties as unknown as { $t?: Translator["t"] };
    return {
        now: () => Date.now(),
        accessMap,
        isConnected,
        getLocalDoc: (id) => localDoc(id),
        getLocalTranslations: localTranslations,
        queryTranslations,
        fetchKey: async (parentId) => {
            await ensureFreshToken();
            return fetchHlsKeyOutcome(parentId);
        },
        resolveSource,
        pinRetention,
        unpinRetention,
        getPinnedRetentionIds,
        onDocsDeletedByCommand,
        watchDocs,
        onForeground(listener) {
            const onVisibility = () => {
                if (document.visibilityState === "visible") listener();
            };
            document.addEventListener("visibilitychange", onVisibility);
            return () => document.removeEventListener("visibilitychange", onVisibility);
        },
        // The i18n plugin is installed after the build-target services, so it is looked up when a text is needed.
        translator() {
            const t = globals.$t;
            return t ? { t: (key, params) => t(key, params ?? {}) } : undefined;
        },
        languageKey: () => appLanguageAsRef.value?.languageCode,
        notify(text, state = "info") {
            useNotificationStore().addNotification({
                title: text,
                state,
                type: "toast",
                timeout: 6000,
            });
        },
        navigate(path) {
            void router.push(path);
        },
        reportError(error, op) {
            reportError(error, { area: "downloads", op });
        },
    };
}
