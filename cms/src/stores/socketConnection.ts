import { defineStore } from "pinia";
import { getSocket } from "@/socket";
import { type ApiDataResponseDto, type ChangeReqAckDto } from "@/types";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";
import { useLocalChangeStore } from "./localChanges";

export const useSocketConnectionStore = defineStore("socketConnection", () => {
    const isConnected = ref(false);

    const bindEvents = () => {
        const socket = getSocket();

        socket.on("connect", async () => {
            isConnected.value = true;

            const syncVersionString = localStorage.getItem("syncVersion");
            let syncVersion = 0;
            if (syncVersionString) syncVersion = Number.parseInt(syncVersionString);

            socket.emit("clientDataReq", {
                version: syncVersion, // Get documents that are newer than the last received version
                cms: true,
            });
        });

        socket.on("disconnect", () => {
            isConnected.value = false;
        });

        socket.on("data", async (data: ApiDataResponseDto) => {
            await db.docs.bulkPut(data.docs);
            if (data.version) localStorage.setItem("syncVersion", data.version.toString());
        });

        socket.on("changeRequestAck", async (ack: ChangeReqAckDto) => {
            const localChangeStore = useLocalChangeStore();

            await localChangeStore.handleAck(ack);
        });
    };

    return { isConnected, bindEvents };
});
