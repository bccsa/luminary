import { watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqInfo, changeReqWarnings } from "../config";

async function send(change: LocalChangeDto): Promise<boolean> {
    const formData = new LFormData();
    formData.append("changeRequest", change);

    const res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
    if (!res) return false;

    changeReqWarnings.value = [];
    changeReqErrors.value = [];
    changeReqInfo.value = [];
    await db.applyLocalChangeAck(res, change);
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

export function syncLocalChanges(localChanges: Ref<LocalChangeDto[]>): SyncLocalChangesHandle {
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
        [isConnected, queueSignature],
        async () => {
            if (!isConnected.value || localChanges.value.length === 0) return;
            if (running) return;
            running = true;

            const drain = (async () => {
                try {
                    while (isConnected.value) {
                        const change = (await db.localChanges.toCollection().first()) as
                            | LocalChangeDto
                            | undefined;
                        if (!change) return;

                        let sent = false;
                        for (let attempt = 0; attempt < 3; attempt++) {
                            if (!isConnected.value) return;
                            if (await send(change)) {
                                sent = true;
                                break;
                            }
                            if (attempt < 2) await new Promise((r) => setTimeout(r, 100));
                        }

                        // The head failed every attempt; stop without touching the rest of
                        // the queue so order is preserved and we don't hammer the API.
                        if (!sent) {
                            changeReqErrors.value.push(
                                "Unable to submit saved changes. Please refresh the page to try again.",
                            );
                            return;
                        }
                    }
                } catch (err) {
                    console.error("syncLocalChanges error:", err);
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
