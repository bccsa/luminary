import Dexie, { type Table } from "dexie";
import type { ContentDto, PostDto } from "./types";
import { ref } from "vue";

export class BaseDatabase extends Dexie {
    posts!: Table<PostDto>;
    content!: Table<ContentDto>;

    constructor() {
        super("ac-db");
        this.version(1).stores({
            posts: "_id",
            content: "_id",
        });
    }
}

export const db = new BaseDatabase();

export const dbReady = ref(false);

db.on("ready", () => {
    dbReady.value = true;
});
