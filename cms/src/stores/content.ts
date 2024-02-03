import { defineStore } from "pinia";
import { db } from "@/db";
import type { ContentDto } from "@/types";

export const useContentStore = defineStore("content", () => {
    function saveContent(data: ContentDto[]) {
        return db.content.bulkPut(data);
    }

    return { saveContent };
});
