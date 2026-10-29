import { vi } from "vitest";
import { DEFAULT_RECOVERY_POLICY, type AdapterSource } from "@luminary-media-converter/player-web";
import type { HlsJsVideoElement } from "@luminary-media-converter/player-web";

/** A list the element's rendition and track lists stand in for: iterable, indexable, an event target. */
export class FakeList<T> extends EventTarget {
    constructor(public items: T[] = []) {
        super();
    }
    get length(): number {
        return this.items.length;
    }
    [Symbol.iterator](): Iterator<T> {
        return this.items[Symbol.iterator]();
    }
    set(items: T[], event?: string): void {
        this.items = items;
        if (event) this.dispatchEvent(new Event(event));
    }
}

export interface FakeEngine {
    handlers: Map<string, Set<(event: string, data: unknown) => void>>;
    nextLevel: number;
    currentLevel: number;
    recoverMediaError: ReturnType<typeof vi.fn>;
    startLoad: ReturnType<typeof vi.fn>;
    bandwidthEstimate: number;
    on(event: string, fn: (event: string, data: unknown) => void): void;
    off(event: string, fn: (event: string, data: unknown) => void): void;
    emit(event: string, data: unknown): void;
}

export function fakeEngine(): FakeEngine {
    const handlers = new Map<string, Set<(event: string, data: unknown) => void>>();
    return {
        handlers,
        nextLevel: -1,
        currentLevel: -1,
        recoverMediaError: vi.fn(),
        startLoad: vi.fn(),
        bandwidthEstimate: 0,
        on(event, fn) {
            const set = handlers.get(event) ?? new Set();
            set.add(fn);
            handlers.set(event, set);
        },
        off(event, fn) {
            handlers.get(event)?.delete(fn);
        },
        emit(event, data) {
            for (const fn of [...(handlers.get(event) ?? [])]) fn(event, data);
        },
    };
}

/** What `<hlsjs-video>` exposes that the adapter reads and writes. */
export class FakeElement extends EventTarget {
    source: unknown = null;
    src = "";
    currentTime = 0;
    duration = NaN;
    paused = true;
    readyState = 0;
    playbackRate = 1;
    buffered: { length: number; start(i: number): number; end(i: number): number } = {
        length: 0,
        start: () => 0,
        end: () => 0,
    };
    engine: FakeEngine | null = fakeEngine();
    videoRenditions = new FakeList<{ id: string; height?: number; bitrate?: number }>();
    audioTracks = new FakeList<{ id: string; label: string; language: string; enabled: boolean }>();
    textTracks = new FakeList<unknown>();
    play = vi.fn(async () => {
        this.paused = false;
    });
    pause = vi.fn(() => {
        this.paused = true;
    });
    addTextTrack = vi.fn();
    shadowRoot = null;
}

export function fakeElement(): FakeElement & HlsJsVideoElement {
    return new FakeElement() as unknown as FakeElement & HlsJsVideoElement;
}

export function adapterSource(overrides: Partial<AdapterSource> = {}): AdapterSource {
    return {
        url: "blob:master",
        isBlob: true,
        recovery: DEFAULT_RECOVERY_POLICY,
        ...overrides,
    };
}

/**
 * The app's jsdom (23) answers `HTMLMediaElement.textTracks` with a plain array; browsers, and the
 * jsdom 26 these specs were written on, answer an event-dispatching list the player listens to.
 */
export function installTextTrackListShim(): void {
    const lists = new WeakMap<HTMLMediaElement, FakeList<unknown>>();
    Object.defineProperty(HTMLMediaElement.prototype, "textTracks", {
        configurable: true,
        get(this: HTMLMediaElement) {
            let list = lists.get(this);
            if (!list) lists.set(this, (list = new FakeList<unknown>()));
            return list;
        },
    });
}
