export type Distribution = {
    n: number;
    min: number;
    p50: number;
    p95: number;
    max: number;
    mean: number;
};

export function distribution(values: number[]): Distribution {
    if (!values.length) return { n: 0, min: 0, p50: 0, p95: 0, max: 0, mean: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    return {
        n: sorted.length,
        min: r(sorted[0]),
        p50: r(percentile(sorted, 0.5)),
        p95: r(percentile(sorted, 0.95)),
        max: r(sorted[sorted.length - 1]),
        mean: r(sorted.reduce((a, b) => a + b, 0) / sorted.length),
    };
}

/** Nearest-rank percentile over a pre-sorted array. */
export function percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const rank = Math.ceil(p * sorted.length);
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export function mean(values: number[]): number {
    if (!values.length) return 0;
    return r(values.reduce((a, b) => a + b, 0) / values.length);
}

export function r(value: number, places = 2): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
}

/** Render a Markdown table. `align` marks numeric columns for right alignment. */
export function table(headers: string[], rows: (string | number)[][], align?: boolean[]): string {
    const sep = headers.map((_, i) => (align?.[i] ? "---:" : ":---"));
    const lines = [
        `| ${headers.join(" | ")} |`,
        `| ${sep.join(" | ")} |`,
        ...rows.map((row) => `| ${row.map((c) => String(c)).join(" | ")} |`),
    ];
    return lines.join("\n");
}

export function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${r(bytes / 1024, 1)} KB`;
    return `${r(bytes / (1024 * 1024), 2)} MB`;
}
