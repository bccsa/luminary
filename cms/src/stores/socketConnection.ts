import { defineStore } from "pinia";
import { socket } from "@/socket";
import { type BaseDocument } from "@/types/cms";
import { usePostStore } from "./post";

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

            socket.on("data", (data: BaseDocument[]) => {
                console.log(data);

                const postStore = usePostStore();

                postStore.savePosts(data);
            });
        },
    },
});
