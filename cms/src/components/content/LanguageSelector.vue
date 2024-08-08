<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/vue";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";
import LBadge from "@/components/common/LBadge.vue";
import {
    type ContentDto,
    type LanguageDto,
    type PostDto,
    type TagDto,
    type Uuid,
} from "luminary-shared";
import { computed } from "vue";
import LButton from "@/components/button/LButton.vue";
import { ArrowRightIcon } from "@heroicons/vue/16/solid";

type Props = {
    parent?: PostDto | TagDto;
    content?: ContentDto[];
    languages: LanguageDto[];
};

defineProps<Props>();

const emit = defineEmits(["createTranslation"]);
</script>

<template>
    <Menu as="div" class="relative inline-block text-left">
        <div>
            <MenuButton
                :as="LButton"
                :icon="ChevronDownIcon"
                variant="tertiary"
                iconRight
                data-test="language-selector"
            >
                Add a translation
            </MenuButton>
        </div>

        <transition
            enter-active-class="transition ease-out duration-100"
            enter-from-class="transform opacity-0 scale-95"
            enter-to-class="transform opacity-100 scale-100"
            leave-active-class="transition ease-in duration-75"
            leave-from-class="transform opacity-100 scale-100"
            leave-to-class="transform opacity-0 scale-95"
        >
            <MenuItems
                class="absolute -left-1 z-10 mt-2 w-56 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:-right-1 sm:left-auto sm:origin-top-right"
            >
                <div class="py-1">
                    <MenuItem
                        v-slot="{ active }"
                        v-for="language in languages"
                        :key="language.languageCode"
                    >
                        <button
                            @click="emit('createTranslation', language)"
                            :class="[
                                active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700',
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
                    </MenuItem>
                </div>
            </MenuItems>
        </transition>
    </Menu>
</template>
