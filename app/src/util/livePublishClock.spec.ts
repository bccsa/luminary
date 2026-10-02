import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { ApiDataResponseDto, ContentDto } from "luminary-shared";

// Capture the "data" listener initLivePublishClock registers on the socket.
let onData: ((data: ApiDataResponseDto) => void) | undefined;

vi.mock("luminary-shared", async () => {
    const actual = await vi.importActual<typeof import("luminary-shared")>("luminary-shared");
    return {
        ...actual,
        getSocket: () => ({
            on: (_event: string, cb: (data: ApiDataResponseDto) => void) => {
                onData = cb;
            },
        }),
    };
});

const { initLivePublishClock } = await import("./livePublishClock");
const { sessionNow, __resetSessionNow } = await import("./sessionNow");
const { DocType, PublishStatus } = await import("luminary-shared");

/** Minimal published Content doc with the fields the listener inspects. */
function makeContent(overrides: Partial<ContentDto> = {}): ContentDto {
    return {
        type: DocType.Content,
        status: PublishStatus.Published,
        _id: "c1",
        publishDate: 0,
        ...overrides,
    } as ContentDto;
}

const T0 = 1_000_000;

describe("livePublishClock", () => {
    beforeEach(() => {
        onData = undefined;
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        __resetSessionNow();
        initLivePublishClock();
        // Capture the page-load bound. (initLivePublishClock registers only; it
        // does not read sessionNow, so the first read here pins the bound to T0.)
        expect(sessionNow()).toBe(T0);
    });

    afterEach(() => {
        __resetSessionNow();
        vi.useRealTimers();
    });

    it("registers a data listener on the socket", () => {
        expect(typeof onData).toBe("function");
    });

    it("bumps the bound when a published content doc arrives with publishDate newer than the bound", () => {
        vi.setSystemTime(2_000_000); // publish happens after page load

        onData!({ docs: [makeContent({ publishDate: 2_000_000 })] });

        expect(sessionNow()).toBe(2_000_000);
    });

    it("does not bump for an edit to an already-published doc (publishDate < bound)", () => {
        onData!({ docs: [makeContent({ publishDate: 500_000 })] });

        expect(sessionNow()).toBe(T0);
    });

    it("does not bump for draft content even with a future publishDate", () => {
        onData!({ docs: [makeContent({ status: PublishStatus.Draft, publishDate: 9_000_000 })] });

        expect(sessionNow()).toBe(T0);
    });

    it("does not bump for non-content docs", () => {
        onData!({ docs: [{ type: DocType.Tag, _id: "t1" } as ContentDto] });

        expect(sessionNow()).toBe(T0);
    });

    it("does not bump when the batch has no qualifying doc", () => {
        onData!({ docs: [] });

        expect(sessionNow()).toBe(T0);
    });

    it("does not bump for future-scheduled content (publishDate ahead of the real clock)", () => {
        vi.setSystemTime(2_000_000);
        const futurePublishDate = 5_000_000; // scheduled, well ahead of the real clock

        onData!({ docs: [makeContent({ publishDate: futurePublishDate })] });

        // No bump — the doc is future-dated, so widening the bound changes nothing
        // visible: includeScheduled feeds show coming-soon docs via
        // parentShowComingSoon (bound-independent), and a bump to Date.now()
        // wouldn't let a future publishDate through anyway. Avoids a no-op re-key
        // cascade across every content feed.
        expect(sessionNow()).toBe(T0);
    });
});