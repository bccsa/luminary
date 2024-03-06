import { defineStore } from "pinia";
import { type Language } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";
import { LanguageRepository } from "@/db/repositories/languageRepository";
import { sortByName } from "@/util/sortByName";

export const useLanguageStore = defineStore("language", () => {
    const languageRepository = new LanguageRepository();

    const languages: Readonly<Ref<Language[] | undefined>> = useObservable(
        liveQuery(async () => {
            return (await languageRepository.getAll()).sort(sortByName);
        }) as any,
    );

    return { languages };
});
