import { config } from "./config";

/** Where in the shared lib a failure or step happened, so error trackers can group and search by flow. */
export type DiagnosticContext = {
    /** Subsystem, e.g. `"HybridQuery"`, `"sync"`, `"socket"`. */
    area: string;
    /** Operation within the area, e.g. `"offline-persist"`. */
    op: string;
    /** Details of the failing operation (query, doc type, counts, …). */
    data?: Record<string, unknown>;
};

/** Consumer-supplied sink (e.g. Sentry) for shared-lib failures and flow steps. */
export type DiagnosticsReporter = {
    captureError: (err: unknown, ctx: DiagnosticContext) => void;
    breadcrumb?: (message: string, ctx: DiagnosticContext) => void;
};

/** Log a handled failure and hand it, with its flow context, to the configured reporter. */
export function reportError(err: unknown, ctx: DiagnosticContext): void {
    console.error(`[${ctx.area}] ${ctx.op} failed:`, err, ...(ctx.data ? [ctx.data] : []));
    try {
        config?.diagnostics?.captureError(err, ctx);
    } catch {
        // A broken reporter must never break the flow that was reporting
    }
}

/** Record a flow step so the reporter can show what led up to a later error. */
export function reportBreadcrumb(message: string, ctx: DiagnosticContext): void {
    try {
        config?.diagnostics?.breadcrumb?.(message, ctx);
    } catch {
        // A broken reporter must never break the flow that was reporting
    }
}
