import { defineStore } from "pinia";
import { getSocket } from "@/socket";
import { type BaseDocumentDto, type ChangeReqAckDto } from "@/types";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { useLocalChangeStore } from "./localChanges";

export const useSocketConnectionStore = defineStore("socketConnection", () => {
    const isConnected = ref(false);

    const bindEvents = () => {
        const socket = getSocket();

        socket.on("connect", async () => {
            isConnected.value = true;

            const lastUpdatedDoc = await db.docs.orderBy("updatedTimeUtc").last();

            socket.emit("clientDataReq", {
                version: lastUpdatedDoc ? lastUpdatedDoc.updatedTimeUtc : 0, // Get documents that are newer than our most recent document
                cms: true,
            });
        });

        socket.on("disconnect", () => {
            isConnected.value = false;
        });

        socket.on("data", async (data: BaseDocumentDto[]) => {
            await db.docs.bulkPut(data);
        });

        socket.on("changeRequestAck", async (ack: ChangeReqAckDto) => {
            const localChangeStore = useLocalChangeStore();

            await localChangeStore.handleAck(ack);
        });
    };

    return { isConnected, bindEvents };
});
