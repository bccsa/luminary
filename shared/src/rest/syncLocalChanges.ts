import { ref, watch, type Ref } from "vue";
import { isConnected } from "../socket/socketio";
import { ChangeRequestQuery, getRest } from "./RestApi";
import {
    ChangeReqAckDto,
    ChangeReqDto,
    ContentParentDto,
    DocType,
    ImageUnprocessedDto,
    ImageUploadDto,
    LocalChangeDto,
} from "../types";
import { db } from "../db/database";

export const processChangeReqLock = ref(false);

function convertChangeReqToFormData(changeReq: ChangeReqDto) {
    const formData = new FormData();
    const doc = structuredClone(changeReq.doc);

    if (doc.type === DocType.Post || doc.type === DocType.Tag) {
        const _doc = doc as ContentParentDto;
        if (_doc.imageData?.uploadData) {
            const newUploadData: ImageUnprocessedDto[] = [];
            _doc.imageData.uploadData.forEach((u: ImageUploadDto, i: number) => {
                const imgBlob = new Blob([u.fileData], { type: "image/webp" });
                const fileKey = `fileData_${i}`;

                // Append the binary file to formData
                formData.append(fileKey, imgBlob, u.filename || `${i}-img-${_doc._id}`);

                // Build unprocessed DTO
                newUploadData.push({
                    fileIndex: fileKey,
                    preset: u.preset,
                    filename: u.filename,
                });
            });
            _doc.imageData.uploadData = newUploadData;
        }
    }
}

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
}
