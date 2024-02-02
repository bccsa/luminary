import { defineStore } from "pinia";
import { socket } from "@/socket";
import { DocType, type BaseDocument, type PostDto, type ContentDto } from "@/types";
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

            socket.on("data", async (data: BaseDocument[]) => {
                console.log(data);

                const postStore = usePostStore();

                await postStore.savePosts(
                    data.filter((item) => item.type == DocType.Post) as PostDto[],
                );
            });
        },
    },
});
