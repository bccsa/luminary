import { defineStore, storeToRefs } from "pinia";
import { AckStatus, type LocalChangeDto, type ChangeReqAckDto } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { watch, type Ref, computed } from "vue";
import { LocalChangesRepository } from "@/db/repositories/localChangesRepository";
import { type Observable } from "rxjs";
import { useSocketConnectionStore } from "./socketConnection";
import { getSocket } from "@/socket";
import { db } from "@/db/baseDatabase";

const ONE_MINUTE_IN_MS = 60000;

export const useLocalChangeStore = defineStore("localChanges", () => {
    let retryApiSubmissionTimeout: number;
    const localChangesRepository = new LocalChangesRepository();

    const localChanges: Readonly<Ref<LocalChangeDto[] | undefined>> = useObservable(
        liveQuery(async () => localChangesRepository.getAll()) as unknown as Observable<
            LocalChangeDto[]
        >,
    );

    const isLocalChange = computed(() => {
        return (docId: string) => {
            return localChanges.value?.some((change) => change.doc._id === docId);
            // TODO: filter on changed content documents who has the post/tag as parent if the document itself is not changed.
        };
    });

    const watchForSyncableChanges = () => {
        const { isConnected } = storeToRefs(useSocketConnectionStore());

        watch([isConnected, localChanges], async ([isConnected, localChanges], [wasConnected]) => {
            if (!localChanges || localChanges.length == 0) {
                return;
            }

            if (
                (isConnected && !wasConnected && localChanges.length > 0) ||
                (isConnected && localChanges.length == 1)
            ) {
                await syncFirstLocalChangeToApi();
            }
        });
    };

    const syncFirstLocalChangeToApi = async () => {
        if (retryApiSubmissionTimeout) {
            clearTimeout(retryApiSubmissionTimeout);
        }

        const change = localChanges.value![0];
        // Sanity check for if this method was somehow called when there are no local changes
        if (!change) {
            return;
        }

        // Retry the submission after one minute if we haven't gotten an ack from the API
        retryApiSubmissionTimeout = window.setTimeout(() => {
            syncFirstLocalChangeToApi();
        }, ONE_MINUTE_IN_MS);

        getSocket().emit("changeRequest", change);
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

        clearTimeout(retryApiSubmissionTimeout);

        if (localChanges.value && localChanges.value.length > 1) {
            await syncFirstLocalChangeToApi();
        }
    };

    return { localChanges, watchForSyncableChanges, handleAck, isLocalChange };
});
