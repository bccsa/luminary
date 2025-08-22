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
export const processChangeReqLock = ref(true);

/**
 * Handle change request acknowledgements from the api
 * @param ack ack from api
 * @param localChanges the local changes from db as Ref to keep reactivity
 */
async function handleAck(ack: ChangeReqAckDto, localChanges: Ref<LocalChangeDto[]>) {
    // Clear previous warnings and errors
    changeReqWarnings.value = [];
    changeReqErrors.value = [];

    await db.applyLocalChangeAck(ack);

    //Update localChanges with changes made after acknowledgements was applied to localChanges
    localChanges.value = await db.getLocalChanges();

    processChangeReqLock.value = false;
}

/**
 * Push a single local change to the api
 * @param localChange the local change to push
 * @param localChanges the local changes from db as Ref to keep reactivity
 */
async function pushLocalChange(localChange: LocalChangeDto, localChanges: Ref<LocalChangeDto[]>) {
    processChangeReqLock.value = false;

    const formData = new LFormData();
    formData.append("changeRequestId", localChange.id);
    formData.append("changeRequestDoc", localChange.doc);

    const res = await getRest().changeRequest(formData);

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

    watch(isConnected, (connected) => {
        if (connected) {
            processChangeReqLock.value = false;
            /*
             To ensure safety, we can reset the lock when the connection is established
             This prevents any pending change requests from being processed while the connection is down
             and ensures that the next change request will be processed correctly.
            */
        } else {
            processChangeReqLock.value = true;
        }
    });
}
