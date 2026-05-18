import { watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqWarnings } from "../config";

let running = false;

/**
 * Drain pending local changes one-at-a-time while online. Exits on empty
 * queue, disconnect, or a non-ack response. The watcher re-enters on the
 * next localChanges mutation or reconnect.
 *
 * We read the head of the queue from the db (not the ref) so that we see
 * the result of `applyLocalChangeAck` immediately — the Dexie live query
 * refreshes async, so the ref would be one step behind inside the loop.
 */
async function drain() {
    if (running) return;
    running = true;
    let attempts = 0;
    try {
        while (isConnected.value) {
            const change = (await db.localChanges.toCollection().first()) as
                | LocalChangeDto
                | undefined;
            if (!change) return;

            const formData = new LFormData();
            formData.append("changeRequest", change);

            const res = (await getRest().changeRequest(formData)) as ChangeReqAckDto | undefined;
            if (!res) {
                if (++attempts >= 3) return;
                await new Promise((r) => setTimeout(r, 100));
                continue;
            }
            attempts = 0;

            changeReqWarnings.value = [];
            changeReqErrors.value = [];
            await db.applyLocalChangeAck(res, change);
        }
    } finally {
        running = false;
    }
}

export function syncLocalChanges(localChanges: Ref<LocalChangeDto[]>) {
    watch(
        [isConnected, localChanges],
        () => {
            drain().catch((err) => console.error("syncLocalChanges drain error:", err));
        },
        { immediate: true },
    );
}
