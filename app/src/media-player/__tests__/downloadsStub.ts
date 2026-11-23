import { vi, type Mock } from "vitest";
import { ref, type Ref } from "vue";
import type { ContentDto } from "luminary-shared";
import type {
    DownloadBadge,
    DownloadEntry,
    DownloadNetwork,
    DownloadPlayback,
    DownloadPlaybackCloseReason,
    DownloadsService,
    DownloadTimeline,
    DownloadTimelineSpan,
} from "@/build-time/contracts/downloads/contract";

/**
 * A timeline by the engine's rules, so the player's conversions are pinned to the same values the engine gives.
 * `doneUnits` are the units done when the session opened.
 */
export function timelineOf(
    spans: DownloadTimelineSpan[],
    fullDuration: number,
    doneUnits: string[] = [],
): DownloadTimeline {
    const last = spans.at(-1);
    const localDuration = last ? last.localStart + (last.fullEnd - last.fullStart) : 0;
    const toLocal = (t: number) => {
        if (!spans.length) return undefined;
        const k = spans.find((span) => t < span.fullEnd);
        if (!k) return { local: 0, exact: false };
        if (t >= k.fullStart) return { local: k.localStart + t - k.fullStart, exact: true };
        return { local: k.localStart, exact: false };
    };
    const toFull = (l: number) => {
        if (!spans.length) return 0;
        const clamped = Math.min(Math.max(l, 0), localDuration);
        const k = [...spans].reverse().find((span) => span.localStart <= clamped)!;
        return k.fullStart + clamped - k.localStart;
    };
    return {
        spans,
        fullDuration,
        localDuration,
        toLocal,
        toFull,
        resumeLocal(p) {
            if (!spans.length) return 0;
            const at = toLocal(p)!;
            if (!at.exact) return at.local;
            const k = spans.find((span) => p < span.fullEnd)!;
            return k.localStart + Math.max(0, p - 30 - k.fullStart);
        },
        chapter(c) {
            const k = spans.find(
                (span) => c.startTime >= span.fullStart && c.startTime < span.fullEnd,
            );
            const done = c.unitIds.length > 0 && c.unitIds.every((id) => doneUnits.includes(id));
            if (k && done) {
                const endTime =
                    c.endTime >= k.fullEnd
                        ? k.localStart + k.fullEnd - k.fullStart
                        : toLocal(Math.min(c.endTime, k.fullEnd))!.local;
                return { startTime: toLocal(c.startTime)!.local, endTime, available: true };
            }
            const next = spans.find((span) => span.fullStart >= c.startTime);
            const at = next ? next.localStart : localDuration;
            return { startTime: at, endTime: at, available: false };
        },
    };
}

let sessions = 0;

/** A download session as the service hands it to the player. */
export function playbackOf(
    timeline: DownloadTimeline,
    extra: Partial<Omit<DownloadPlayback, "timeline" | "close">> = {},
): DownloadPlayback & { close: Mock<[], Promise<void>> } {
    const playbackId = extra.playbackId ?? `pb-${++sessions}`;
    return {
        downloadId: "dl-1",
        playbackId,
        masterUrl: `luminary://offline/${playbackId}/built/master.m3u8`,
        timeline,
        ...extra,
        close: vi.fn<[], Promise<void>>(async () => {}),
    };
}

/** A download entry with the given chapters, each one unit, `done` naming those stored. */
export function entryOf(
    parentId: string,
    chapters: { startTime: number; endTime: number; title?: string }[],
    done: number[],
): DownloadEntry {
    return {
        downloadId: "dl-1",
        parentId,
        parentType: "post",
        createdAt: 0,
        updatedAt: 0,
        completedAt: null,
        status: "downloading",
        reason: null,
        queuedAt: null,
        selection: { kind: "video", audioLanguage: "eng" },
        item: { state: "done", bytes: 0 },
        units: chapters.map((_, i) => ({
            unitId: `u${i}`,
            state: done.includes(i) ? "done" : "pending",
            bytes: 1,
        })),
        chapters: chapters.map((chapter, i) => ({
            title: chapter.title ?? `Chapter ${i + 1}`,
            startTime: chapter.startTime,
            endTime: chapter.endTime,
            unitIds: [`u${i}`],
        })),
        volumeId: "internal",
        encrypted: false,
        key: "none",
        expiresAt: null,
        revokedAt: null,
        lastSourceCheckAt: null,
        meteredConsent: false,
        content: {
            title: parentId,
            contentId: "c",
            language: "eng",
            memberOf: [],
            durationSeconds: 0,
        },
    };
}

type OpenArgs = [content: ContentDto, options: { preferOnline: boolean }];

export type PlayerHooksStub = {
    open: Mock<OpenArgs, Promise<DownloadPlayback | null>>;
    moreReady(parentId: string): void;
    closed(playbackId: string, reason: DownloadPlaybackCloseReason): void;
    /** Tells the listeners of a pick on the sheet; resolves with what each answered. */
    sourceChosen(parentId: string, value: "downloaded" | "online"): Promise<unknown[]>;
    notice(text: string): boolean;
    override: Ref<"downloaded" | "online" | undefined>;
};

/** A downloads service built from the contract alone, with its player hooks driven by the test. */
export function downloadsServiceStub(
    init: {
        entries?: DownloadEntry[];
        playable?: string[];
        network?: DownloadNetwork;
        badges?: Record<string, DownloadBadge>;
        eligible?: boolean;
    } = {},
): DownloadsService & {
    hooks: PlayerHooksStub;
    entriesRef: Ref<DownloadEntry[]>;
    networkRef: Ref<DownloadNetwork>;
    playableRef: Ref<Set<string>>;
} {
    const listeners = {
        moreReady: new Set<(parentId: string) => void>(),
        closed: new Set<(playbackId: string, reason: DownloadPlaybackCloseReason) => void>(),
        sourceChosen: new Set<(parentId: string, value: "downloaded" | "online") => unknown>(),
        notice: new Set<(text: string) => boolean>(),
    };
    const listen =
        <T>(set: Set<T>) =>
        (listener: T) => {
            set.add(listener);
            return () => void set.delete(listener);
        };
    const entriesRef = ref(init.entries ?? []) as Ref<DownloadEntry[]>;
    const networkRef = ref<DownloadNetwork>(init.network ?? { online: true, metered: false });
    const playableRef = ref(new Set(init.playable ?? [])) as Ref<Set<string>>;
    const override = ref<"downloaded" | "online" | undefined>(undefined);
    const hooks: PlayerHooksStub = {
        open: vi.fn<OpenArgs, Promise<DownloadPlayback | null>>(async () => null),
        moreReady: (id) => listeners.moreReady.forEach((l) => l(id)),
        closed: (id, reason) => listeners.closed.forEach((l) => l(id, reason)),
        sourceChosen: (id, value) =>
            Promise.all(Array.from(listeners.sourceChosen).map((l) => l(id, value))),
        notice: (text) => Array.from(listeners.notice).some((l) => l(text)),
        override,
    };
    return {
        hooks,
        entriesRef,
        networkRef,
        playableRef,
        capabilities: { notifications: "final", volumes: false, sheet: true, sparsePlayback: true },
        ready: ref(true),
        entries: entriesRef,
        progress: ref(new Map()),
        badges: ref(new Map(Object.entries(init.badges ?? {}))),
        playableParentIds: playableRef,
        attentionCount: ref(0),
        storage: ref(null),
        network: networkRef,
        entryFor: (parentId) => entriesRef.value.find((entry) => entry.parentId === parentId),
        eligibility: () => ref(init.eligible ?? false),
        openSheet: vi.fn(async () => {}),
        pause: vi.fn(async () => {}),
        resume: vi.fn(async () => {}),
        resumeAll: vi.fn(async () => {}),
        cancel: vi.fn(async () => {}),
        remove: vi.fn(async () => []),
        cleanUp: vi.fn(async () => 0),
        refreshStorage: vi.fn(async () => {}),
        setPreferredVolume: vi.fn(async () => {}),
        artwork: vi.fn(async () => undefined),
        player: {
            open: (content, options) => hooks.open(content, options),
            onMoreReady: listen(listeners.moreReady),
            onClosed: listen(listeners.closed),
            onSourceChosen: listen(listeners.sourceChosen),
            sourceOverride: () => override.value,
            onNotice: listen(listeners.notice),
        },
        ui: {
            DownloadBadge: {},
            ResumeBanner: {},
            DeleteLocalDataOption: {},
            WatchFilterSwitch: {},
            AutoplayModePill: {},
        },
        lifecycle: {
            recheck: vi.fn(async () => {}),
            totalBytes: ref(0),
            removeAll: vi.fn(async () => ({ kept: [] })),
        },
    };
}
