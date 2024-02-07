import { defineStore } from "pinia";
import { socket } from "@/socket";
import { type BaseDocumentDto } from "@/types";
import { db } from "@/db";

export const useSocketConnectionStore = defineStore("socketConnection", {
    state: () => ({
        isConnected: false,
    }),

    actions: {
        bindEvents() {
            socket.on("connect", () => {
                this.isConnected = true;

                socket.emit("clientDataReq", {
                    version: 0,
                    cms: true,
                });
            });

            socket.on("disconnect", () => {
                this.isConnected = false;
            });

            socket.on("data", async (data: BaseDocumentDto[]) => {
                await db.docs.bulkPut(data);
            });
        },
    },
});
