import { computed, ref, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import type {
    DownloadBadge,
    DownloadEntry,
    DownloadNetwork,
    DownloadProgress,
    DownloadStorage,
} from "@/build-time/contracts/downloads/contract";
import { badgeFor, needsAttention, sameBadge } from "./badges";
import { isPlayable } from "./entries";

/** The service's reactive copy of what the engine holds, and the reducers that keep it. */
export type DownloadsState = {
    ready: Ref<boolean>;
    entries: ShallowRef<readonly DownloadEntry[]>;
    progress: ShallowRef<ReadonlyMap<string, DownloadProgress>>;
    storage: ShallowRef<DownloadStorage | null>;
    network: Ref<DownloadNetwork>;
    byParent: ComputedRef<ReadonlyMap<string, DownloadEntry>>;
    badges: ComputedRef<ReadonlyMap<string, DownloadBadge>>;
    playableParentIds: ComputedRef<ReadonlySet<string>>;
    attentionCount: ComputedRef<number>;
    byId(downloadId: string): DownloadEntry | undefined;
    load(entries: readonly DownloadEntry[], progress: readonly DownloadProgress[]): void;
    applyEntry(entry: DownloadEntry): void;
    applyProgress(progress: DownloadProgress): void;
    /** Drops a download; returns what was held of it. */
    remove(downloadId: string): DownloadEntry | undefined;
};

/** Statuses with nothing left to transfer, whose progress is no longer kept. */
const SETTLED = new Set<DownloadEntry["status"]>(["complete", "revoked"]);

export function createDownloadsState(): DownloadsState {
    const ready = ref(false);
    const entries = shallowRef<readonly DownloadEntry[]>([]);
    const progress = shallowRef<ReadonlyMap<string, DownloadProgress>>(new Map());
    const storage = shallowRef<DownloadStorage | null>(null);
    const network = ref<DownloadNetwork>({ online: true, metered: false });

    const byParent = computed(() => new Map(entries.value.map((e) => [e.parentId, e])));

    // An unchanged badge keeps its object, so a tile's own computed sees no change and does not re-render.
    let previousBadges = new Map<string, DownloadBadge>();
    const badges = computed(() => {
        const volumes = storage.value?.volumes ?? [];
        const next = new Map<string, DownloadBadge>();
        for (const entry of entries.value) {
            const badge = badgeFor(entry, progress.value.get(entry.downloadId), volumes);
            const previous = previousBadges.get(entry.parentId);
            next.set(entry.parentId, previous && sameBadge(previous, badge) ? previous : badge);
        }
        previousBadges = next;
        return next as ReadonlyMap<string, DownloadBadge>;
    });

    const playableParentIds = computed(
        () =>
            new Set(
                entries.value.filter((e) => isPlayable(e, storage.value)).map((e) => e.parentId),
            ) as ReadonlySet<string>,
    );

    const attentionCount = computed(() => entries.value.filter(needsAttention).length);

    function dropProgress(downloadId: string) {
        if (!progress.value.has(downloadId)) return;
        const next = new Map(progress.value);
        next.delete(downloadId);
        progress.value = next;
    }

    return {
        ready,
        entries,
        progress,
        storage,
        network,
        byParent,
        badges,
        playableParentIds,
        attentionCount,
        byId: (downloadId) => entries.value.find((e) => e.downloadId === downloadId),
        load(list, live) {
            entries.value = [...list];
            progress.value = new Map(live.map((p) => [p.downloadId, p]));
        },
        applyEntry(entry) {
            const index = entries.value.findIndex((e) => e.downloadId === entry.downloadId);
            const next = [...entries.value];
            if (index >= 0) next[index] = entry;
            else next.push(entry);
            entries.value = next;
            if (SETTLED.has(entry.status)) dropProgress(entry.downloadId);
        },
        applyProgress(update) {
            const entry = entries.value.find((e) => e.downloadId === update.downloadId);
            if (entry && SETTLED.has(entry.status)) return;
            const next = new Map(progress.value);
            next.set(update.downloadId, update);
            progress.value = next;
        },
        remove(downloadId) {
            const entry = entries.value.find((e) => e.downloadId === downloadId);
            if (entry) entries.value = entries.value.filter((e) => e.downloadId !== downloadId);
            dropProgress(downloadId);
            return entry;
        },
    };
}
