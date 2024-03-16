import { defineStore } from "pinia";
import { socket } from "@/socket";
import { type BaseDocumentDto } from "@/types";
import { db } from "@/db/baseDatabase";
import { ref } from "vue";

export const useSocketConnectionStore = defineStore("socketConnection", () => {
    const isConnected = ref(false);

    const bindEvents = () => {
        socket.on("connect", async () => {
            isConnected.value = true;

            const lastUpdatedDoc = await db.docs.orderBy("updatedTimeUtc").last();

            socket.emit("clientDataReq", {
                version: lastUpdatedDoc ? lastUpdatedDoc.updatedTimeUtc : 0, // Get documents that are newer than our most recent document
            });
        });

        socket.on("disconnect", () => {
            isConnected.value = false;
        });

        socket.on("data", async (data: BaseDocumentDto[]) => {
            await db.docs.bulkPut(data);
        });
    };

    return { isConnected, bindEvents };
});
