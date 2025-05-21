import { ref, watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { ChangeRequestQuery, getRest } from "./RestApi";
import { ChangeReqAckDto, LocalChangeDto } from "../types";
import { db } from "../db/database";

export const processChangeReqLock = ref(false);
let retryTimeout = 0;

/**
 * Handle change request acknowledgements from the api
 * @param ack ack from api
 * @param localChanges the local changes from db as Ref to keep reactivity
 */
async function handleAck(ack: ChangeReqAckDto, localChanges: Ref<LocalChangeDto[]>) {
    await db.applyLocalChangeAck(ack);
    localChanges.value = await db.getLocalChanges();

    // Push the next local change to api
    clearTimeout(retryTimeout);
    if (localChanges.value.length > 1) {
        pushLocalChange(localChanges.value[0], localChanges);
    } else {
        processChangeReqLock.value = false;
    }
}

/**
 * Push a single local change to the api
 * @param localChange the local change to push
 * @param localChanges the local changes from db as Ref to keep reactivity
 */
async function pushLocalChange(localChange: LocalChangeDto, localChanges: Ref<LocalChangeDto[]>) {
    processChangeReqLock.value = true;
    if (retryTimeout) {
        clearTimeout(retryTimeout);
    }

    // Retry the submission after one minute if we haven't gotten an ack from the API
    retryTimeout = window.setTimeout(() => {
        pushLocalChange(localChange, localChanges);
    }, 60000);

    const res = await getRest().changeRequest({
        id: localChange.id,
        doc: localChange.doc,
    } as ChangeRequestQuery);

    if (res) {
        handleAck(res as ChangeReqAckDto, localChanges);
    }
}

export function syncLocalChanges(localChanges: Ref<LocalChangeDto[]>) {
    // Watch for local changes
    watch(
        [isConnected, localChanges],
        async () => {
            if (!localChanges) return;
            if (localChanges.value.length == 0) return;
            if (processChangeReqLock.value) return;
            if (!isConnected.value) return;

            pushLocalChange(localChanges.value[0], localChanges);
        },
        { immediate: true },
    );

    // Update localChanges from db
    setInterval(async () => (localChanges.value = await db.getLocalChanges()), 500);
}
