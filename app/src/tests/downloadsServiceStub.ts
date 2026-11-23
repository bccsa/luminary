import { vi } from "vitest";
import { computed, defineComponent, h, inject, ref, type Ref } from "vue";
import type {
    DownloadBadge,
    DownloadEntry,
    DownloadNetwork,
    DownloadProgress,
    DownloadsService,
    DownloadStorage,
} from "@/build-time/contracts/downloads/contract";
import { DownloadsKey } from "@/build-time/contracts/downloads/token";

/**
 * Stand-ins for the components a downloads service hands out. Each reads the service it is rendered under, as the
 * real ones do, and renders a marker the page tests look for.
 */
const DownloadBadgeStub = defineComponent({
    name: "DownloadBadgeStub",
    props: { parentId: { type: String, required: true } },
    setup(props) {
        const service = inject(DownloadsKey, undefined);
        const badge = computed(() => service?.badges.value.get(props.parentId));
        return () =>
            badge.value && badge.value.state !== "none"
                ? h("span", {
                      "data-test": "stub-download-badge",
                      "data-parent-id": props.parentId,
                      "data-state": badge.value.state,
                  })
                : null;
    },
});

const ResumeBannerStub = defineComponent({
    name: "ResumeBannerStub",
    setup() {
        return () => h("div", { "data-test": "stub-resume-banner" });
    },
});

const DeleteLocalDataOptionStub = defineComponent({
    name: "DeleteLocalDataOptionStub",
    props: { modelValue: { type: Boolean, default: false } },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        return () =>
            h("input", {
                type: "checkbox",
                "data-test": "stub-delete-local-data-option",
                checked: props.modelValue,
                onChange: (event: Event) =>
                    emit("update:modelValue", (event.target as HTMLInputElement).checked),
            });
    },
});

const WatchFilterSwitchStub = defineComponent({
    name: "WatchFilterSwitchStub",
    props: { modelValue: { type: Boolean, default: false } },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        return () =>
            h("button", {
                type: "button",
                "data-test": "stub-watch-filter",
                "data-downloaded-only": String(props.modelValue),
                onClick: () => emit("update:modelValue", !props.modelValue),
            });
    },
});

const AutoplayModePillStub = defineComponent({
    name: "AutoplayModePillStub",
    props: { mode: { type: String, default: "all" } },
    setup(props) {
        return () => h("span", { "data-test": "stub-autoplay-mode", "data-mode": props.mode });
    },
});

export type DownloadsServiceStub = DownloadsService & {
    entriesRef: Ref<DownloadEntry[]>;
    badgesRef: Ref<Map<string, DownloadBadge>>;
    playableRef: Ref<Set<string>>;
    attentionRef: Ref<number>;
    networkRef: Ref<DownloadNetwork>;
    totalBytesRef: Ref<number>;
};

/** A minimal entry for a parent, enough for the pages that only count or list downloads. */
export function stubEntry(parentId: string, overrides: Partial<DownloadEntry> = {}): DownloadEntry {
    return {
        downloadId: `dl-${parentId}`,
        parentId,
        parentType: "post",
        createdAt: 0,
        updatedAt: 0,
        completedAt: 0,
        status: "complete",
        reason: null,
        queuedAt: null,
        selection: { kind: "video", audioLanguage: "eng" },
        item: { state: "done", bytes: 0 },
        units: [],
        chapters: [],
        volumeId: "internal",
        encrypted: false,
        key: "none",
        expiresAt: null,
        revokedAt: null,
        lastSourceCheckAt: null,
        meteredConsent: false,
        content: {
            title: parentId,
            contentId: `content-${parentId}`,
            language: "lang-eng",
            memberOf: [],
            durationSeconds: 0,
        },
        ...overrides,
    };
}

/** A downloads service built from the contract alone, with its state exposed as plain refs for tests to drive. */
export function createDownloadsServiceStub(
    init: {
        entries?: DownloadEntry[];
        badges?: Record<string, DownloadBadge>;
        playableParentIds?: string[];
        attentionCount?: number;
        network?: DownloadNetwork;
        totalBytes?: number;
    } = {},
): DownloadsServiceStub {
    const entriesRef = ref(init.entries ?? []) as Ref<DownloadEntry[]>;
    const badgesRef = ref(new Map(Object.entries(init.badges ?? {}))) as Ref<
        Map<string, DownloadBadge>
    >;
    const playableRef = ref(new Set(init.playableParentIds ?? [])) as Ref<Set<string>>;
    const attentionRef = ref(init.attentionCount ?? 0);
    const networkRef = ref<DownloadNetwork>(init.network ?? { online: true, metered: false });
    const totalBytesRef = ref(init.totalBytes ?? 0);
    const storage = ref<DownloadStorage | null>(null);
    const progress = ref(new Map<string, DownloadProgress>());

    return {
        entriesRef,
        badgesRef,
        playableRef,
        attentionRef,
        networkRef,
        totalBytesRef,
        capabilities: { notifications: "final", volumes: false, sheet: true, sparsePlayback: true },
        ready: ref(true),
        entries: entriesRef,
        progress,
        badges: badgesRef,
        playableParentIds: playableRef,
        attentionCount: attentionRef,
        storage,
        network: networkRef,
        entryFor: (parentId) => entriesRef.value.find((e) => e.parentId === parentId),
        eligibility: () => ref(false),
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
            open: vi.fn(async () => null),
            onMoreReady: () => () => {},
            onClosed: () => () => {},
            onSourceChosen: () => () => {},
            sourceOverride: () => undefined,
            onNotice: () => () => {},
        },
        ui: {
            DownloadBadge: DownloadBadgeStub,
            ResumeBanner: ResumeBannerStub,
            DeleteLocalDataOption: DeleteLocalDataOptionStub,
            WatchFilterSwitch: WatchFilterSwitchStub,
            AutoplayModePill: AutoplayModePillStub,
        },
        lifecycle: {
            recheck: vi.fn(async () => {}),
            totalBytes: totalBytesRef,
            removeAll: vi.fn(async () => ({ kept: [] as string[] })),
        },
    };
}

/** `global.provide` for mounting a component under the stub. */
export function provideDownloadsStub(service: DownloadsService) {
    return { [DownloadsKey as symbol]: service };
}
