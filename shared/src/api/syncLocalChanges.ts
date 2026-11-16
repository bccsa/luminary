import { ref, watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqInfo, changeReqWarnings } from "../config";
import { reportError } from "../diagnostics";

type SyncLocalChangesTargetDb = Pick<
    typeof db,
    "localChanges" | "applyLocalChangeAck" | "failLocalChangeAck"
>;

export type SyncLocalChangesOptions = {
    targetDb?: SyncLocalChangesTargetDb;
    dataSource?: string;
    ready?: Ref<boolean>;
    quiet?: boolean;
    paceMs?: number;
};

async function send(
    change: LocalChangeDto,
    options: Required<SyncLocalChangesOptions>,
): Promise<boolean> {
    const formData = new LFormData();
    formData.append("changeRequest", change);
    if (options.dataSource) formData.append("dataSource", options.dataSource);

    const res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
    if (!res) return false;

    if (!options.quiet) {
        changeReqWarnings.value = [];
        changeReqErrors.value = [];
        changeReqInfo.value = [];
    }
    await options.targetDb.applyLocalChangeAck(res, change);
    return true;
}

/**
 * Handle returned by {@link syncLocalChanges}. `stop()` unsubscribes the watcher and
 * resolves once any in-flight drain has fully unwound, so callers (notably tests) can
 * deterministically join the async drain loop before tearing down shared state.
 */
export type SyncLocalChangesHandle = {
    stop: () => Promise<void>;
};

export function syncLocalChanges(
    localChanges: Ref<LocalChangeDto[]>,
    options: SyncLocalChangesOptions = {},
): SyncLocalChangesHandle {
    const resolved: Required<SyncLocalChangesOptions> = {
        targetDb: options.targetDb ?? db,
        dataSource: options.dataSource ?? "",
        ready: options.ready ?? ref(true),
        quiet: options.quiet ?? false,
        paceMs: options.paceMs ?? 0,
    };

    // Per-registration state. Production registers exactly once (RestApi), so this is
    // identical to the previous module-global behaviour; scoping it to the closure lets
    // tests register/teardown per test without leaking a stuck `running` flag.
    let running = false;
    let drainPromise: Promise<void> | null = null;

    // Trigger on the *contents* of the queue (its ids), not the liveQuery array identity.
    // Dexie's liveQuery re-emits a fresh array on observer churn even when the queued
    // changes are unchanged; watching the raw ref would restart the drain on every such
    // re-emit. After the head exhausts its retry cap and the drain bails, an identical
    // re-emit must NOT re-enter the drain and re-hammer the same failing change — only a
    // real queue mutation (a different id set) or a reconnect should. Keying on the id
    // signature makes those the only triggers.
    const queueSignature = () => localChanges.value.map((c) => c.id).join(",");

    const unwatch = watch(
        [isConnected, queueSignature, () => resolved.ready.value],
        async () => {
            if (!resolved.ready.value) return;

            if (!isConnected.value) {
                for (const change of localChanges.value) {
                    resolved.targetDb.failLocalChangeAck(
                        change.id,
                        "Saved locally. The connection was lost before the server confirmed the change.",
                    );
                }
                return;
            }
            if (localChanges.value.length === 0) return;
            if (running) return;
            running = true;

            const drain = (async () => {
                let activeChange: LocalChangeDto | undefined;
                try {
                    while (isConnected.value && resolved.ready.value) {
                        const change = (await resolved.targetDb.localChanges
                            .toCollection()
                            .first()) as
                            | LocalChangeDto
                            | undefined;
                        if (!change) return;
                        activeChange = change;

                        let sent = false;
                        for (let attempt = 0; attempt < 3; attempt++) {
                            if (!isConnected.value || !resolved.ready.value) return;
                            if (await send(change, resolved)) {
                                sent = true;
                                break;
                            }
                            if (attempt < 2) await new Promise((r) => setTimeout(r, 100));
                        }

                        // The head failed every attempt; stop without touching the rest of
                        // the queue so order is preserved and we don't hammer the API.
                        if (!sent) {
                            const message =
                                "Unable to submit saved changes. Please refresh the page to try again.";
                            if (!resolved.quiet) changeReqErrors.value.push(message);
                            resolved.targetDb.failLocalChangeAck(change.id, message);
                            return;
                        }

                        if (resolved.paceMs > 0) {
                            await new Promise((r) => setTimeout(r, resolved.paceMs));
                        }
                    }
                } catch (err) {
                    reportError(err, {
                        area: "syncLocalChanges",
                        op: "submit",
                        data: { docId: activeChange?.docId, docType: activeChange?.doc.type },
                    });
                    if (activeChange) {
                        const message =
                            "Unable to submit saved changes. Please refresh the page to try again.";
                        if (!resolved.quiet) changeReqErrors.value.push(message);
                        resolved.targetDb.failLocalChangeAck(activeChange.id, message);
                    }
                } finally {
                    running = false;
                }
            })();

            drainPromise = drain;
            await drain;
            if (drainPromise === drain) drainPromise = null;
        },
        { immediate: true },
    );

    return {
        async stop() {
            unwatch();
            // Join any in-flight drain. The drain's own `isConnected` guards bail promptly
            // once the socket is disconnected, so this is bounded by at most one in-flight
            // send() plus one backoff sleep for all current call sites.
            const pending = drainPromise;
            if (pending) await pending;
        },
    };
}
