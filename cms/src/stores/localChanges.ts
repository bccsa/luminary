import { defineStore, storeToRefs } from "pinia";
import {
    AckStatus,
    DocType,
    LocalChangeStatus,
    type LocalChange,
    type ChangeReqDto,
    type ChangeReqAckDto,
    type Uuid,
    type ChangeReqItemDto,
} from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { watch, type Ref, computed } from "vue";
import { LocalChangesRepository } from "@/db/repositories/localChangesRepository";
import type { Observable } from "rxjs";
import { useSocketConnectionStore } from "./socketConnection";
import { socket } from "@/socket";
import { db } from "@/db/baseDatabase";

type LocalChangeCollection = { [key: Uuid]: LocalChange[] };

export const useLocalChangeStore = defineStore("localChanges", () => {
    const localChangesRepository = new LocalChangesRepository();

    const unsyncedChanges: Readonly<Ref<LocalChange[] | undefined>> = useObservable(
        liveQuery(async () => localChangesRepository.getUnsynced()) as unknown as Observable<
            LocalChange[]
        >,
    );

    const unsyncedChangesByReqId = computed(() => {
        if (!unsyncedChanges) {
            return {};
        }

        return unsyncedChanges.value!.reduce((returnObject: LocalChangeCollection, change) => {
            returnObject[change.reqId] = returnObject[change.reqId] || [];

            returnObject[change.reqId].push(change);

            return returnObject;
        }, {});
    });

    const watchForSyncableChanges = () => {
        const { isConnected } = storeToRefs(useSocketConnectionStore());

        watch([isConnected, unsyncedChanges], async ([isConnected, localChanges]) => {
            if (isConnected && localChanges && localChanges.length > 0) {
                await syncLocalChangesToApi(unsyncedChangesByReqId.value);
            }
        });
    };

    const syncLocalChangesToApi = async (localChanges: LocalChangeCollection) => {
        await Object.keys(localChanges).forEach(async (reqId) => {
            const changesToSubmit = localChanges[reqId];

            changesToSubmit.forEach(async (change) => {
                await localChangesRepository.update(change, {
                    status: LocalChangeStatus.Syncing,
                });
            });

            const changeReq: ChangeReqDto = {
                reqId,
                type: DocType.ChangeReq,
                changes: localChanges[reqId].map(
                    (change) =>
                        ({
                            id: change.id,
                            doc: change.doc,
                        }) as ChangeReqItemDto,
                ),
            };

            socket.emit("data", changeReq);
        });
    };

    const handleAck = async (ack: ChangeReqAckDto) => {
        if (ack.ack == AckStatus.Rejected) {
            if (ack.doc) {
                // Replace our local copy with the provided database version
                await db.docs.update(ack.doc._id, ack.doc);
            } else {
                // Otherwise attempt to delete the item, as it might have been a rejected create action
                const docId = (await localChangesRepository.get(ack.reqId))?.docId;

                if (docId) {
                    await db.docs.delete(docId);
                }
            }
        }

        await localChangesRepository.delete(ack.reqId);
    };

    return { watchForSyncableChanges, handleAck };
});
