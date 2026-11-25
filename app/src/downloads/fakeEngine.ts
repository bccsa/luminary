import { shallowRef, type ShallowRef } from "vue";
import type {
    DownloadChapter,
    DownloadEntry,
    DownloadNetwork,
    DownloadNotificationTexts,
    DownloadOptions,
    DownloadPlaybackCloseReason,
    DownloadPlaybackSession,
    DownloadProgress,
    DownloadReason,
    DownloadRemoveResult,
    DownloadSelection,
    DownloadSheetAction,
    DownloadSheetModel,
    DownloadSheetTexts,
    DownloadSource,
    DownloadSourceCheck,
    DownloadStorage,
    DownloadsCapabilities,
    DownloadsEngine,
    DownloadsEngineErrorCode,
    DownloadsEngineEvents,
} from "@/build-time/contracts/downloads/contract";
import { buildTimeline, spansFor } from "./fakeTimeline";

const MB = 1_000_000;
const GB = 1_000_000_000;

/** The choices and sizes the fake offers for every content. */
export const FAKE_OPTIONS: DownloadOptions = (() => {
    const chapters = [
        { title: "Opening", startTime: 0, endTime: 600 },
        { title: "Message", startTime: 600, endTime: 1500 },
        { title: "Closing", startTime: 1500, endTime: 1800 },
    ];
    const share = chapters.map((c) => (c.endTime - c.startTime) / 1800);
    const sized = (total: number) => ({
        chapterBytes: share.map((s) => Math.round(s * total)),
        approximate: false,
    });
    const sizes: DownloadOptions["sizes"] = {};
    for (const language of ["en", "fr"]) {
        sizes[`audio/${language}`] = sized(30 * MB);
        sizes[`video/main/720/${language}`] = sized(600 * MB);
        sizes[`video/main/360/${language}`] = sized(200 * MB);
    }
    return {
        kinds: ["video", "audio"],
        angles: [{ id: "main", label: "Main" }],
        qualities: {
            main: [
                { id: "720", label: "720p", detail: "HD" },
                { id: "360", label: "360p" },
            ],
        },
        languages: [
            { id: "en", label: "English" },
            { id: "fr", label: "Français" },
        ],
        chapters,
        sizes,
        itemBytes: 2 * MB,
    };
})();

export const FAKE_DURATION_SECONDS = 1800;
const RESERVE_BYTES = 500 * MB;

export function selectionKey(selection: DownloadSelection): string {
    return selection.kind === "audio"
        ? `audio/${selection.audioLanguage}`
        : `video/${selection.angleId}/${selection.qualityId}/${selection.audioLanguage}`;
}

function engineError(code: DownloadsEngineErrorCode, message?: string): Error {
    return Object.assign(new Error(message ?? code), { code });
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const randomId = () =>
    Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

type Listeners = Map<keyof DownloadsEngineEvents, Set<(payload: never) => void>>;

/** The fake's sheet as a platform would show it. */
export type FakeSheet = { model: DownloadSheetModel; texts?: DownloadSheetTexts };

export type FakeEngine = DownloadsEngine & {
    /** What the sheet shows now; null when no sheet is up. */
    readonly sheet: ShallowRef<FakeSheet | null>;
    /** Notification words last handed over, by download id. */
    readonly texts: ReadonlyMap<string, DownloadNotificationTexts>;
    /** How often the notification permission was asked for. */
    readonly permissionRequests: number;
    /** Moves the transfers on by one step: the item, or the next chapter. */
    tick(): void;
    /** What the viewer does in the sheet. */
    act(action: DownloadSheetAction): void;
    fail(downloadId: string, reason: DownloadReason): void;
    setNetwork(network: Partial<DownloadNetwork>): void;
    setFreeBytes(bytes: number, volumeId?: string): void;
    setMounted(volumeId: string, mounted: boolean): void;
    /**
     * The next source check reports its first chapter as deferred; later checks keep deferring it while a session
     * of the download is open, and the first one after replaces it.
     */
    deferNextCheck(): void;
    /**
     * Ends a playback session: released by the player (reported as `playbackReleased`), or with a reason stopped by
     * the engine itself (reported as `playbackClosed`).
     */
    closeSession(playbackId: string, reason?: DownloadPlaybackCloseReason): void;
    tapNotification(
        downloadId: string | null,
        kind: DownloadsEngineEvents["notificationTap"]["kind"],
    ): void;
    /** The sessions open now, by playback id. */
    readonly sessions: ReadonlyMap<string, string>;
    entry(downloadId: string): DownloadEntry | undefined;
    dispose(): void;
};

export type FakeEngineOptions = {
    /** Advances on its own at this interval; without it, only `tick()` moves transfers. */
    intervalMs?: number;
    /** A storage card is reported beside internal storage. */
    card?: boolean;
    capabilities?: Partial<DownloadsCapabilities>;
    now?: () => number;
    network?: Partial<DownloadNetwork>;
};

/** An in-memory `DownloadsEngine`, so the downloads UI can be built and tested in a browser. */
export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
    const now = options.now ?? (() => Date.now());
    const capabilities: DownloadsCapabilities = {
        notifications: "progress",
        volumes: options.card ?? false,
        sheet: true,
        sparsePlayback: true,
        ...options.capabilities,
    };
    const listeners: Listeners = new Map();
    const entries = new Map<string, DownloadEntry>();
    const sources = new Map<string, DownloadSource>();
    const texts = new Map<string, DownloadNotificationTexts>();
    const sessions = new Map<string, string>();
    const pendingReplace = new Set<string>();
    const sheet = shallowRef<FakeSheet | null>(null);
    let deferNext = false;
    let permissionRequests = 0;
    let network: DownloadNetwork = { online: true, metered: false, ...options.network };
    const emptyReclaimable = () => ({ orphans: 0, staging: 0, unreferenced: 0, expired: 0 });
    const storage: DownloadStorage = {
        volumes: [
            {
                id: "internal",
                kind: "internal",
                label: "Internal storage",
                mounted: true,
                totalBytes: 64 * GB,
                freeBytes: 8 * GB,
                downloadsBytes: 0,
                reclaimable: { ...emptyReclaimable(), orphans: 40 * MB },
            },
            ...(options.card
                ? [
                      {
                          id: "card-1",
                          kind: "card" as const,
                          label: "SD card",
                          mounted: true,
                          totalBytes: 32 * GB,
                          freeBytes: 20 * GB,
                          downloadsBytes: 0,
                          reclaimable: emptyReclaimable(),
                      },
                  ]
                : []),
        ],
        reserveBytes: RESERVE_BYTES,
        preferredVolumeId: "internal",
    };

    function emit<E extends keyof DownloadsEngineEvents>(
        event: E,
        payload: DownloadsEngineEvents[E],
    ) {
        const set = listeners.get(event) as Set<(p: DownloadsEngineEvents[E]) => void> | undefined;
        for (const listener of Array.from(set ?? [])) listener(clone(payload));
    }

    const volume = (id: string) => storage.volumes.find((v) => v.id === id);
    const planned = (e: DownloadEntry) => e.item.bytes + e.units.reduce((s, u) => s + u.bytes, 0);
    const stored = (e: DownloadEntry) =>
        (e.item.state === "done" ? e.item.bytes : 0) +
        e.units.filter((u) => u.state === "done").reduce((s, u) => s + u.bytes, 0);
    const pendingWork = (e: DownloadEntry) =>
        e.item.state === "pending" || e.units.some((u) => u.state === "pending");

    function touch(e: DownloadEntry) {
        e.updatedAt = now();
        emit("entry", e);
        if (pendingWork(e) && e.status !== "revoked") {
            emit("progress", progressOf(e));
        }
    }

    function progressOf(e: DownloadEntry): DownloadProgress {
        return {
            downloadId: e.downloadId,
            bytesDone: stored(e),
            bytesTotal: planned(e),
            bytesPerSecond: e.status === "downloading" ? 2 * MB : 0,
            units: Object.fromEntries(
                e.units.filter((u) => u.state === "pending").map((u) => [u.unitId, 0]),
            ),
        };
    }

    function blocker(e: DownloadEntry): DownloadReason | null {
        if (!network.online) return "network";
        if (network.metered && !e.meteredConsent) return "metered";
        if (!volume(e.volumeId)?.mounted) return "volume";
        return null;
    }

    function schedule() {
        for (const e of entries.values()) {
            if (e.status !== "queued" && e.status !== "waiting" && e.status !== "downloading") {
                continue;
            }
            const reason = blocker(e);
            if (reason && e.reason !== reason) {
                e.status = "waiting";
                e.reason = reason;
                touch(e);
            } else if (!reason && e.status === "waiting") {
                e.status = "queued";
                e.reason = null;
                touch(e);
            }
        }
        if ([...entries.values()].some((e) => e.status === "downloading")) return;
        const next = [...entries.values()]
            .filter((e) => e.status === "queued")
            .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0))[0];
        if (next) {
            next.status = "downloading";
            touch(next);
        }
    }

    function complete(e: DownloadEntry) {
        e.status = "complete";
        e.reason = null;
        e.queuedAt = null;
        if (e.completedAt === null) e.completedAt = now();
    }

    function requeue(e: DownloadEntry) {
        if (e.status === "complete" || e.status === "paused" || e.status === "failed") {
            e.status = "queued";
            e.reason = null;
            e.queuedAt = now();
        }
    }

    function drop(e: DownloadEntry, reason: DownloadsEngineEvents["removed"]["reason"]) {
        const vol = volume(e.volumeId);
        if (vol) {
            vol.freeBytes += stored(e);
            vol.downloadsBytes = Math.max(0, vol.downloadsBytes - stored(e));
        }
        entries.delete(e.downloadId);
        sources.delete(e.downloadId);
        emit("removed", { downloadId: e.downloadId, parentId: e.parentId, reason });
    }

    function stopSessions(downloadId: string, reason: DownloadPlaybackCloseReason) {
        for (const [playbackId, id] of Array.from(sessions)) {
            if (id !== downloadId) continue;
            sessions.delete(playbackId);
            emit("playbackClosed", { playbackId, downloadId, reason });
        }
    }

    function get(downloadId: string): DownloadEntry {
        const e = entries.get(downloadId);
        if (!e) throw engineError("unknown-download");
        return e;
    }

    function tick() {
        schedule();
        const e = [...entries.values()].find((x) => x.status === "downloading");
        if (!e) return;
        const vol = volume(e.volumeId);
        let bytes = 0;
        if (e.item.state === "pending") {
            e.item.state = "done";
            bytes = e.item.bytes;
        } else {
            const unit = e.units.find((u) => u.state === "pending");
            if (unit) {
                unit.state = "done";
                bytes = unit.bytes;
            }
        }
        if (vol) {
            vol.freeBytes -= bytes;
            vol.downloadsBytes += bytes;
        }
        if (!pendingWork(e)) complete(e);
        touch(e);
        schedule();
    }

    const timer = options.intervalMs ? setInterval(tick, options.intervalMs) : undefined;

    const engine: FakeEngine = {
        capabilities,
        sheet,
        texts,
        get permissionRequests() {
            return permissionRequests;
        },
        sessions,
        entry: (downloadId) => {
            const e = entries.get(downloadId);
            return e ? clone(e) : undefined;
        },

        async list() {
            const all = [...entries.values()];
            return {
                entries: clone(all),
                progress: all.filter(pendingWork).map(progressOf),
            };
        },
        async network() {
            return { ...network };
        },
        async storage() {
            return clone(storage);
        },
        async setPreferredVolume(volumeId) {
            if (!volume(volumeId)?.mounted) throw engineError("volume-unavailable");
            storage.preferredVolumeId = volumeId;
            emit("storage", storage);
            return clone(storage);
        },
        async requestNotificationPermission() {
            permissionRequests += 1;
            return true;
        },
        async options() {
            return clone(FAKE_OPTIONS);
        },
        async start(request) {
            const key = selectionKey(request.selection);
            const sizes = FAKE_OPTIONS.sizes[key];
            if (!sizes) throw engineError("invalid-argument", `no such selection ${key}`);
            const existing = entries.get(request.downloadId);
            const indices = [...new Set(request.chapterIndices)]
                .filter((i) => i >= 0 && i < FAKE_OPTIONS.chapters.length)
                .sort((a, b) => a - b);
            if (existing) {
                for (const i of indices) {
                    const chapter = existing.chapters[i];
                    if (chapter.unitIds.length > 0) continue;
                    const unitId = `u${i}`;
                    existing.units.push({ unitId, state: "pending", bytes: sizes.chapterBytes[i] });
                    existing.units.sort((a, b) => a.unitId.localeCompare(b.unitId));
                    chapter.unitIds = [unitId];
                }
                existing.meteredConsent = request.meteredConsent;
                existing.completedAt = pendingWork(existing) ? null : existing.completedAt;
                texts.set(existing.downloadId, request.texts);
                if (pendingWork(existing)) requeue(existing);
                const updated = clone(existing);
                touch(existing);
                schedule();
                return updated;
            }
            if ([...entries.values()].some((e) => e.parentId === request.parentId)) {
                throw engineError("already-exists");
            }
            const vol = volume(request.volumeId);
            if (!vol?.mounted) throw engineError("volume-unavailable");
            const size =
                FAKE_OPTIONS.itemBytes + indices.reduce((s, i) => s + sizes.chapterBytes[i], 0);
            if (size + storage.reserveBytes > vol.freeBytes) throw engineError("no-space");
            const chapters: DownloadChapter[] = FAKE_OPTIONS.chapters.map((c, i) => ({
                ...c,
                unitIds: indices.includes(i) ? [`u${i}`] : [],
            }));
            const at = now();
            const entry: DownloadEntry = {
                downloadId: request.downloadId,
                parentId: request.parentId,
                parentType: request.parentType,
                createdAt: at,
                updatedAt: at,
                completedAt: null,
                status: "queued",
                reason: null,
                queuedAt: at,
                selection: { ...request.selection },
                item: { state: "pending", bytes: FAKE_OPTIONS.itemBytes },
                units: indices.map((i) => ({
                    unitId: `u${i}`,
                    state: "pending" as const,
                    bytes: sizes.chapterBytes[i],
                })),
                chapters,
                volumeId: request.volumeId,
                encrypted: Boolean(request.source.keyHex),
                key: request.source.keyHex ? "present" : "none",
                expiresAt: request.expiresAt,
                revokedAt: null,
                lastSourceCheckAt: at,
                meteredConsent: request.meteredConsent,
                content: {
                    ...request.content,
                    durationSeconds: FAKE_DURATION_SECONDS,
                    artwork: "item/artwork.jpg",
                },
            };
            entries.set(entry.downloadId, entry);
            sources.set(entry.downloadId, request.source);
            texts.set(entry.downloadId, request.texts);
            const created = clone(entry);
            touch(entry);
            schedule();
            return created;
        },
        async checkSource(downloadId) {
            const e = get(downloadId);
            const result: DownloadSourceCheck = {
                replacedChapters: [],
                deferredChapters: [],
                sideFilesRefreshed: false,
                gone: false,
            };
            if (deferNext) {
                deferNext = false;
                pendingReplace.add(downloadId);
                result.deferredChapters = [0];
                return result;
            }
            const playing = [...sessions.values()].includes(downloadId);
            if (pendingReplace.has(downloadId) && playing) {
                result.deferredChapters = [0];
                return result;
            }
            if (pendingReplace.delete(downloadId)) {
                const unitId = e.chapters[0]?.unitIds[0];
                const unit = e.units.find((u) => u.unitId === unitId);
                if (unit) {
                    unit.state = "pending";
                    e.completedAt = null;
                    requeue(e);
                    result.replacedChapters = [0];
                }
            }
            e.lastSourceCheckAt = now();
            touch(e);
            schedule();
            return result;
        },
        async update(downloadId, patch) {
            const e = get(downloadId);
            if (patch.expiresAt !== undefined) e.expiresAt = patch.expiresAt;
            // As the platforms do: an update after which the expiry (the one given, else the stored one) has passed
            // deletes the download.
            if (e.expiresAt !== null && e.expiresAt <= now()) {
                const last = clone(e);
                drop(e, "expired");
                schedule();
                return last;
            }
            if (patch.content) e.content = { ...patch.content };
            if (patch.texts) texts.set(downloadId, patch.texts);
            touch(e);
            return clone(e);
        },
        async pause(downloadId) {
            const e = get(downloadId);
            if (e.status === "downloading" || e.status === "queued" || e.status === "waiting") {
                e.status = "paused";
                e.reason = "user";
                touch(e);
                schedule();
            }
            return clone(e);
        },
        async resume(downloadId, resumeOptions) {
            const e = get(downloadId);
            if (e.status === "revoked") throw engineError("revoked");
            e.meteredConsent = Boolean(resumeOptions?.meteredConsent);
            if (e.status === "paused" || e.status === "failed") requeue(e);
            else if (e.status === "waiting" && e.reason === "metered" && e.meteredConsent) {
                e.status = "queued";
                e.reason = null;
            }
            touch(e);
            schedule();
            return clone(e);
        },
        async cancel(downloadId) {
            const e = get(downloadId);
            if (!e.units.some((u) => u.state === "done")) {
                drop(e, "cancelled");
                schedule();
                return null;
            }
            const dropped = new Set(
                e.units.filter((u) => u.state === "pending").map((u) => u.unitId),
            );
            e.units = e.units.filter((u) => !dropped.has(u.unitId));
            for (const c of e.chapters) {
                if (c.unitIds.some((id) => dropped.has(id))) c.unitIds = [];
            }
            complete(e);
            touch(e);
            schedule();
            return clone(e);
        },
        async remove(downloadIds, options) {
            const results: DownloadRemoveResult[] = [];
            for (const downloadId of downloadIds) {
                const e = entries.get(downloadId);
                if (!e) {
                    results.push({
                        downloadId,
                        removed: false,
                        code: "unknown-download",
                        freedBytes: 0,
                    });
                } else if ([...sessions.values()].includes(downloadId)) {
                    if (options?.closePlaying) {
                        stopSessions(downloadId, "removed");
                        const freedBytes = stored(e);
                        drop(e, "deleted");
                        results.push({ downloadId, removed: true, freedBytes });
                    } else {
                        results.push({ downloadId, removed: false, code: "locked", freedBytes: 0 });
                    }
                } else {
                    const freedBytes = stored(e);
                    drop(e, "deleted");
                    results.push({ downloadId, removed: true, freedBytes });
                }
            }
            schedule();
            return results;
        },
        async cleanUp() {
            let freed = 0;
            for (const vol of storage.volumes) {
                const r = vol.reclaimable;
                const bytes = r.orphans + r.staging + r.unreferenced + r.expired;
                vol.freeBytes += bytes;
                vol.reclaimable = emptyReclaimable();
                freed += bytes;
            }
            return freed;
        },
        async openPlayback(downloadId) {
            const e = get(downloadId);
            if (e.status === "revoked") throw engineError("revoked");
            if (e.expiresAt !== null && e.expiresAt <= now()) {
                drop(e, "expired");
                throw engineError("expired");
            }
            if (!volume(e.volumeId)?.mounted) throw engineError("volume-unavailable");
            if (e.key === "missing") throw engineError("key-missing");
            const done = new Set(e.units.filter((u) => u.state === "done").map((u) => u.unitId));
            const spans = spansFor(
                e.chapters,
                done,
                e.content.durationSeconds,
                e.units.length > 0 && done.size === e.units.length,
            );
            if (e.item.state !== "done" || spans.length === 0) throw engineError("not-playable");
            const source = sources.get(downloadId);
            const playbackId = randomId();
            sessions.set(playbackId, downloadId);
            const session: DownloadPlaybackSession = {
                playbackId,
                downloadId,
                masterUrl: source?.masterUrl ?? "",
                ...(source?.keyHex ? { keyHex: source.keyHex } : {}),
                ...(source?.thumbnailsUrl ? { thumbnailsUrl: source.thumbnailsUrl } : {}),
                ...(source?.waveformUrl ? { waveformUrl: source.waveformUrl } : {}),
                ...(source?.artworkUrls[0] ? { artworkUrl: source.artworkUrls[0] } : {}),
                timeline: buildTimeline(spans, e.content.durationSeconds, done),
            };
            return session;
        },
        async artwork(downloadId) {
            const e = entries.get(downloadId);
            if (!e?.content.artwork) return undefined;
            const letter = (e.content.title[0] ?? "?").replace(/[<&>"']/g, "");
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="#facc15"/><text x="80" y="58" font-size="40" text-anchor="middle" fill="#422006">${letter}</text></svg>`;
            return `data:image/svg+xml,${encodeURIComponent(svg)}`;
        },
        async closePlayback(playbackId) {
            const downloadId = sessions.get(playbackId);
            if (!downloadId) return;
            sessions.delete(playbackId);
            emit("playbackReleased", { playbackId, downloadId });
        },
        async putKey(downloadId, keyHex) {
            const e = get(downloadId);
            if (e.status === "revoked") throw engineError("revoked");
            const source = sources.get(downloadId);
            if (source) sources.set(downloadId, { ...source, keyHex });
            e.key = "present";
            touch(e);
            return clone(e);
        },
        async revoke(downloadId, reason) {
            const e = get(downloadId);
            stopSessions(downloadId, reason === "access" ? "revoked" : reason);
            if (reason === "access") {
                e.status = "revoked";
                e.reason = "access";
                e.revokedAt = now();
                e.queuedAt = null;
                if (e.key !== "none") e.key = "shredded";
                touch(e);
            } else {
                drop(e, reason);
            }
            schedule();
        },
        async restore(downloadId, keyHex) {
            const e = get(downloadId);
            if (e.encrypted) {
                if (!keyHex) throw engineError("key-missing");
                const source = sources.get(downloadId);
                if (source) sources.set(downloadId, { ...source, keyHex });
                e.key = "present";
            }
            e.revokedAt = null;
            e.reason = null;
            if (pendingWork(e)) {
                e.status = "queued";
                e.queuedAt = now();
            } else {
                complete(e);
            }
            touch(e);
            schedule();
            return clone(e);
        },
        async presentSheet(model, sheetTexts) {
            sheet.value = { model: clone(model), texts: sheetTexts };
        },
        async updateSheet(model) {
            if (sheet.value?.model.sheetId !== model.sheetId) return;
            sheet.value = { ...sheet.value, model: clone(model) };
        },
        async dismissSheet(sheetId) {
            if (sheet.value?.model.sheetId === sheetId) sheet.value = null;
        },
        on(event, listener) {
            const set = listeners.get(event) ?? new Set();
            listeners.set(event, set);
            set.add(listener as (payload: never) => void);
            return () => void set.delete(listener as (payload: never) => void);
        },

        tick,
        act(action) {
            const current = sheet.value;
            if (!current) return;
            if (action.action === "start" || action.action === "dismissed") sheet.value = null;
            emit("sheetAction", { ...action, sheetId: current.model.sheetId });
        },
        fail(downloadId, reason) {
            const e = get(downloadId);
            e.status = "failed";
            e.reason = reason;
            touch(e);
            schedule();
        },
        setNetwork(next) {
            network = { ...network, ...next };
            emit("network", network);
            schedule();
        },
        setFreeBytes(bytes, volumeId = "internal") {
            const vol = volume(volumeId);
            if (vol) vol.freeBytes = bytes;
        },
        setMounted(volumeId, mounted) {
            const vol = volume(volumeId);
            if (!vol) return;
            vol.mounted = mounted;
            if (!mounted && storage.preferredVolumeId === volumeId) {
                storage.preferredVolumeId = "internal";
            }
            if (!mounted) {
                for (const e of entries.values()) {
                    if (e.volumeId === volumeId) stopSessions(e.downloadId, "volume-unavailable");
                }
            }
            emit("storage", storage);
            schedule();
        },
        deferNextCheck() {
            deferNext = true;
        },
        closeSession(playbackId, reason) {
            const downloadId = sessions.get(playbackId);
            if (!downloadId) return;
            sessions.delete(playbackId);
            if (reason) emit("playbackClosed", { playbackId, downloadId, reason });
            else emit("playbackReleased", { playbackId, downloadId });
        },
        tapNotification(downloadId, kind) {
            emit("notificationTap", { downloadId, kind });
        },
        dispose() {
            if (timer) clearInterval(timer);
        },
    };
    return engine;
}
