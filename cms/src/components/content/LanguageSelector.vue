<script setup lang="ts">
import LBadge from "@/components/common/LBadge.vue";
import { type ContentDto, type ContentParentDto, type LanguageDto } from "luminary-shared";
import { ArrowRightIcon } from "@heroicons/vue/16/solid";
import { onClickOutside } from "@vueuse/core";
import { ref } from "vue";

type Props = {
    parent?: ContentParentDto;
    content?: ContentDto[];
};

defineProps<Props>();

const emit = defineEmits(["createTranslation"]);

const showSelector = defineModel<boolean>("showSelector");
const languages = defineModel<LanguageDto[]>("languages");

const languagePopup = ref();

onClickOutside(languagePopup, () => {
    showSelector.value = false;
});
</script>

<template>
    <div ref="languagePopup" class="relative inline-block text-left" data-test="languagePopup">
        <transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
        >
            <ul
                v-show="showSelector"
                class="absolute z-10 w-56 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:-right-28 sm:left-auto sm:origin-top-right"
            >
                <div class="py-1">
                    <li v-for="language in languages" :key="language.languageCode">
                        <button
                            @click="
                                () => {
                                    emit('createTranslation', language);
                                    showSelector = false;
                                }
                            "
                            class="text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                            :class="[
                                'group flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm',
                            ]"
                            :data-test="`select-language-${language.languageCode}`"
                        >
                            <span class="flex items-center gap-2">
                                <LBadge type="language">
                                    {{ language.languageCode }}
                                </LBadge>
                                {{ language.name }}
                            </span>

                            <ArrowRightIcon
                                class="hidden h-4 w-4 text-zinc-600 sm:group-hover:inline-block sm:group-active:inline-block"
                            />
                        </button>
                    </li>
                </div>
            </ul>
        </transition>
    </div>
</template>
