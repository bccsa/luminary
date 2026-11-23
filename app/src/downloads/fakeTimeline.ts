import type {
    DownloadChapter,
    DownloadTimeline,
    DownloadTimelineSpan,
} from "@/build-time/contracts/downloads/contract";

/**
 * A download's timeline by the rules every engine follows, for the fake engine: the app's tests then exercise the
 * same conversions a real engine hands over with a session.
 */
export function buildTimeline(
    spans: readonly DownloadTimelineSpan[],
    fullDuration: number,
    doneAtOpen: ReadonlySet<string>,
): DownloadTimeline {
    const last = spans[spans.length - 1];
    const localDuration = last ? last.localStart + (last.fullEnd - last.fullStart) : 0;

    const toLocal = (fullTime: number) => {
        if (spans.length === 0) return undefined;
        const span = spans.find((s) => fullTime < s.fullEnd);
        if (!span) return { local: 0, exact: false };
        if (fullTime >= span.fullStart) {
            return { local: span.localStart + fullTime - span.fullStart, exact: true };
        }
        return { local: span.localStart, exact: false };
    };

    const toFull = (localTime: number) => {
        const clamped = Math.min(Math.max(localTime, 0), localDuration);
        let span: DownloadTimelineSpan | undefined;
        for (const s of spans) if (s.localStart <= clamped) span = s;
        if (!span) return clamped;
        return span.fullStart + clamped - span.localStart;
    };

    const resumeLocal = (savedFullTime: number) => {
        const local = toLocal(savedFullTime);
        if (!local) return 0;
        if (!local.exact) return local.local;
        const span = spans.find((s) => savedFullTime < s.fullEnd)!;
        return span.localStart + Math.max(0, savedFullTime - 30 - span.fullStart);
    };

    const chapter = (c: Pick<DownloadChapter, "startTime" | "endTime" | "unitIds">) => {
        const available = c.unitIds.length > 0 && c.unitIds.every((id) => doneAtOpen.has(id));
        const span = spans.find((s) => c.startTime < s.fullEnd);
        if (available && span) {
            const startTime = toLocal(c.startTime)!.local;
            const endTime =
                c.endTime >= span.fullEnd
                    ? span.localStart + (span.fullEnd - span.fullStart)
                    : toLocal(c.endTime)!.local;
            return { startTime, endTime, available: true };
        }
        const next = spans.find((s) => s.fullStart >= c.startTime);
        const at = next ? next.localStart : localDuration;
        return { startTime: at, endTime: at, available: false };
    };

    return { spans, fullDuration, localDuration, toLocal, toFull, resumeLocal, chapter };
}

/**
 * The runs of chapters whose units were all done, merged where they meet, each placed after the one before it on
 * the download's own timeline. An item without chapters is one run over its whole duration.
 */
export function spansFor(
    chapters: readonly DownloadChapter[],
    done: ReadonlySet<string>,
    fullDuration: number,
    unitsDone: boolean,
): DownloadTimelineSpan[] {
    if (chapters.length === 0) {
        return unitsDone && fullDuration > 0
            ? [{ fullStart: 0, fullEnd: fullDuration, localStart: 0 }]
            : [];
    }
    const spans: DownloadTimelineSpan[] = [];
    let local = 0;
    for (const c of chapters) {
        const isDone = c.unitIds.length > 0 && c.unitIds.every((id) => done.has(id));
        if (!isDone) continue;
        const previous = spans[spans.length - 1];
        if (previous && previous.fullEnd === c.startTime) {
            previous.fullEnd = c.endTime;
        } else {
            spans.push({ fullStart: c.startTime, fullEnd: c.endTime, localStart: local });
        }
        local += c.endTime - c.startTime;
    }
    return spans;
}
