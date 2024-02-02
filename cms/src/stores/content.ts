import { defineStore } from "pinia";
import type { Content, ContentDto } from "@/types";
import { db } from "@/db";

export const useContentStore = defineStore("content", {
    state: () => ({
        content: [] as Content[],
    }),

    actions: {
        saveContent(data: ContentDto[]) {
            return db.content.bulkPut(data);
        },
    },
});
