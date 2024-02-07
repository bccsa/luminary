import { defineStore } from "pinia";
import { DocType, type Language } from "@/types";
import { liveQuery } from "dexie";
import { db } from "@/db";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";

export const useLanguageStore = defineStore("language", () => {
    const languages: Readonly<Ref<Language[] | undefined>> = useObservable(
        liveQuery(async () => {
            return await db.docs
                .where("type")
                .equals(DocType.Language)
                .toArray((dtos) => dtos as Language[]);
        }) as any,
    );

    return { languages };
});
