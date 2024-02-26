import { defineStore, storeToRefs } from "pinia";
import { AckStatus, LocalChangeStatus, type LocalChange, type ChangeReqAckDto } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { watch, type Ref, computed } from "vue";
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

    const isLocalChange = computed(() => {
        return (docId: string) => {
            return unsyncedChanges.value?.some((change) => change.doc._id === docId);
            // TODO: filter on changed content documents who has the post/tag as parent if the document itself is not changed.
        };
    });

    const watchForSyncableChanges = () => {
        const { isConnected } = storeToRefs(useSocketConnectionStore());

        watch([isConnected, unsyncedChanges], async ([isConnected, localChanges]) => {
            if (isConnected && localChanges && localChanges.length > 0) {
                // TODO instead send changes that are younger than a certain timestamp
                // so non-acknowledged onces are resent instead of being stuck in Syncing forever
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

        socket.emit("changeRequest", localChanges);
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

    return { watchForSyncableChanges, handleAck, isLocalChange };
});
