import { defineStore, storeToRefs } from "pinia";
import {
    LocalChangeStatus,
    type LocalChange,
    type ChangeReqDto,
    DocType,
    type ChangeReqAckDto,
    AckStatus,
} from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { watch, type Ref } from "vue";
import { LocalChangesRepository } from "@/db/repositories/localChangesRepository";
import type { Observable } from "rxjs";
import { useSocketConnectionStore } from "./socketConnection";
import { socket } from "@/socket";

export const useLocalChangeStore = defineStore("localChanges", () => {
    const localChangesRepository = new LocalChangesRepository();

    const unsyncedChanges: Readonly<Ref<LocalChange[] | undefined>> = useObservable(
        liveQuery(async () => localChangesRepository.findUnsynced()) as unknown as Observable<
            LocalChange[]
        >,
    );

    const watchForSyncableChanges = () => {
        const { isConnected } = storeToRefs(useSocketConnectionStore());

        watch([isConnected, unsyncedChanges], async ([isConnected, localChanges]) => {
            if (isConnected && localChanges && localChanges.length > 0) {
                await syncLocalChangesToApi(localChanges);
            }
        });
    };

    const syncLocalChangesToApi = async (localChanges?: LocalChange[]) => {
        await localChanges?.forEach(async (change) => {
            if (change.status == LocalChangeStatus.Unsynced) {
                await localChangesRepository.update(change, {
                    status: LocalChangeStatus.Syncing,
                });

                const changeReq: ChangeReqDto = {
                    reqId: change.reqId,
                    type: DocType.ChangeReq,
                    doc: change.doc,
                };

                socket.emit("data", changeReq);
            }
        });
    };

    const handleAck = async (ack: ChangeReqAckDto) => {
        if (ack.ack == AckStatus.Rejected) {
            // replace or delete document with the provided
        }

        await localChangesRepository.delete(ack.reqId);
    };

    return { watchForSyncableChanges, handleAck };
});
