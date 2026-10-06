<script setup lang="ts">
import LBadge from "@/components/common/LBadge.vue";
import { type ContentDto, type ContentParentDto, type LanguageDto } from "luminary-shared";
import { ArrowRightIcon } from "@heroicons/vue/16/solid";
import { ref } from "vue";

defineProps<{
    parent?: ContentParentDto;
    content?: ContentDto[];
}>();

const emit = defineEmits(["createTranslation"]);

const showSelector = defineModel<boolean>("showSelector", { required: true });
const languages = defineModel<LanguageDto[]>("languages");

const languagePopup = ref();
</script>

<template>
    <div ref="languagePopup" data-test="languagePopup" v-show="showSelector" class="relative">
        <ul class="py-1">
            <li v-for="language in languages" :key="language.languageCode">
                <button
                    @click="
                        () => {
                            emit('createTranslation', language);
                            showSelector = false;
                        }
                    "
                    class="group flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
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
        </ul>
    </div>
</template>
