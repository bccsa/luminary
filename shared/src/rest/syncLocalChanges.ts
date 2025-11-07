import { ref, watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";
import { LFormData } from "../util/LFormData";
import { changeReqErrors, changeReqWarnings } from "../config";

/**
 * Lock to prevent multiple change requests from being processed at the same time
 * This is set to true when a change request is being processed and false when it is done
 * as change requests are asynchronous operations that can take time to complete.
 */
export const processChangeReqLock = ref(false); // start unlocked so first change can go through

/**
 * Handle change request acknowledgements from the api
 * @param ack ack from api
 * @param localChanges the local changes from db as Ref to keep reactivity
 */
async function handleAck(ack: ChangeReqAckDto) {
    // Clear previous warnings and errors
    changeReqWarnings.value = [];
    changeReqErrors.value = [];

    await db.applyLocalChangeAck(ack);

    // Release lock; watcher will notice localChanges updated (Dexie live query) and proceed
    processChangeReqLock.value = false;
}

/**
 * Push a single local change to the api
 * @param localChange the local change to push
 */
async function pushLocalChange(localChange: LocalChangeDto) {
    const formData = new LFormData();
    formData.append("changeRequest", localChange);

    const res = await getRest().changeRequest(formData);

    if (res) handleAck(res as ChangeReqAckDto);
}

export function syncLocalChanges(localChanges: Ref<LocalChangeDto[]>) {
    const attemptSync = () => {
        if (!isConnected.value) return;
        if (localChanges.value.length === 0) return;
        if (processChangeReqLock.value) return; // already processing a change request
        // Acquire lock synchronously so concurrent watcher triggers bail out
        processChangeReqLock.value = true;
        pushLocalChange(localChanges.value[0]);
    };

    watch([isConnected, localChanges, processChangeReqLock], attemptSync, { immediate: true });

    watch(isConnected, (connected) => {
        if (!connected) {
            // Prevent new processing while offline (existing in-flight may still resolve)
            processChangeReqLock.value = true;
            return;
        }
        // When coming online, allow processing and attempt immediately
        processChangeReqLock.value = false;
        attemptSync();
    });
}
