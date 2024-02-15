import { defineStore } from "pinia";
import { socket } from "@/socket";
import { type BaseDocumentDto, type ChangeReqAckDto } from "@/types";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { useLocalChangeStore } from "./localChanges";

export const useSocketConnectionStore = defineStore("socketConnection", () => {
    const isConnected = ref(false);

    const bindEvents = () => {
        socket.on("connect", () => {
            isConnected.value = true;

            socket.emit("clientDataReq", {
                version: 0,
                cms: true,
            });
        });

        socket.on("disconnect", () => {
            isConnected.value = false;
        });

        socket.on("data", async (data: BaseDocumentDto[] | ChangeReqAckDto) => {
            const localChangeStore = useLocalChangeStore();

            if (Array.isArray(data)) {
                await db.docs.bulkPut(data);
                return;
            }

            await localChangeStore.handleAck(data);
        });
    };

    return { isConnected, bindEvents };
});
