import { defineStore } from "pinia";
import { type Language } from "@/types";
import { liveQuery } from "dexie";
import { useObservable } from "@vueuse/rxjs";
import { type Ref } from "vue";
import { LanguageRepository } from "@/db/repositories/languageRepository";

export const useLanguageStore = defineStore("language", () => {
    const languageRepository = new LanguageRepository();

    const languages: Readonly<Ref<Language[] | undefined>> = useObservable(
        liveQuery(async () => {
            return await languageRepository.findAll();
        }) as any,
    );

    return { languages };
});
