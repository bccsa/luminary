import { defineStore, storeToRefs } from "pinia";
import {
    AckStatus,
    DocType,
    LocalChangeStatus,
    type LocalChange,
    type ChangeReqDto,
    type ChangeReqAckDto,
} from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { watch, type Ref } from "vue";
import { LocalChangesRepository } from "@/db/repositories/localChangesRepository";
import type { Observable } from "rxjs";
import { useSocketConnectionStore } from "./socketConnection";
import { socket } from "@/socket";
import { db } from "@/db/baseDatabase";

export const useLocalChangeStore = defineStore("localChanges", () => {
    const localChangesRepository = new LocalChangesRepository();

    const unsyncedChanges: Readonly<Ref<LocalChange[] | undefined>> = useObservable(
        liveQuery(async () => localChangesRepository.getUnsynced()) as unknown as Observable<
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

    const syncLocalChangesToApi = async (localChanges: LocalChange[]) => {
        localChanges.forEach(async (change) => {
            await localChangesRepository.update(change, {
                status: LocalChangeStatus.Syncing,
            });
        });

        socket.emit("data", localChanges);
    };

    const handleAck = async (ack: ChangeReqAckDto) => {
        if (ack.ack == AckStatus.Rejected) {
            if (ack.doc) {
                // Replace our local copy with the provided database version
                await db.docs.update(ack.doc._id, ack.doc);
            } else {
                // Otherwise attempt to delete the item, as it might have been a rejected create action
                const change = await localChangesRepository.get(ack.id);

                if (change?.doc) {
                    await db.docs.delete(change.doc._id);
                }
            }
        }

        await localChangesRepository.delete(ack.id);
    };

    return { watchForSyncableChanges, handleAck };
});
