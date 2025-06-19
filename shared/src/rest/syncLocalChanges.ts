import { ref, watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { ChangeRequestQuery, getRest } from "./RestApi";
import { ChangeReqAckDto, DocType, LocalChangeDto, PostDto, TagDto } from "../types";
import { db } from "../db/database";

export const processChangeReqLock = ref(false);

/**
 * Handle change request acknowledgements from the api
 * @param ack ack from api
 * @param localChanges the local changes from db as Ref to keep reactivity
 */
async function handleAck(ack: ChangeReqAckDto, localChanges: Ref<LocalChangeDto[]>) {
    await db.applyLocalChangeAck(ack);

    //Update localChanges with changes made after acknowledgements was applied to localChanges
    localChanges.value = await db.getLocalChanges();

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

    // If the local change has an image field
    // make a new FormData object and append the image data alongside the rest of the change request as JSON
    // This is to support sending images as part of the change request

    let doc;
    if (localChange.doc.type === DocType.Post || localChange.doc.type === DocType.Tag) {
        const _doc = localChange.doc as PostDto | TagDto;

        if (_doc.imageData?.uploadData && _doc.imageData.uploadData[0].fileData) {
            const fileData = _doc.imageData.uploadData[0].fileData;

            delete _doc.imageData.uploadData; // Remove the uploadData field from the document to avoid sending it as part of the JSON

            const formData = new FormData();

            if (fileData) formData.append("imageData", imageUploadData);

            const blob = new Blob([JSON.stringify(_doc)], { type: "application/json" });
            formData.append("doc", blob);
            doc = formData;
        }
    }

    const res = await getRest().changeRequest({
        id: localChange.id,
        doc,
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
}
