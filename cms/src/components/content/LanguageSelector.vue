<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/vue";
import { ChevronDownIcon } from "@heroicons/vue/20/solid";
import LBadge from "@/components/common/LBadge.vue";
import { storeToRefs } from "pinia";
import { useLanguageStore } from "@/stores/language";
import { ContentStatus, type Content, type Post } from "@/types";
import { computed, toRefs } from "vue";
import { ArrowRightIcon, CheckCircleIcon } from "@heroicons/vue/16/solid";

const props = defineProps<{
    post?: Post;
}>();

const { post } = toRefs(props);

const selectedLanguage = defineModel<string>({ required: true });

const { languages } = storeToRefs(useLanguageStore());

const selectedLanguageName = computed(() => {
    return languages.value?.find((l) => l.languageCode == selectedLanguage.value)?.name;
});

const translatedLanguages = computed(() => {
    if (!post.value) {
        return [];
    }

    return post.value.content.map((c) => c.language);
});

const untranslatedLanguages = computed(() => {
    if (!post.value || !languages.value) {
        return [];
    }

    return languages.value.filter(
        (language) => translatedLanguages.value.findIndex((t) => t._id == language._id) < 0,
    );
});

const translationStatus = computed(() => {
    return (content: Content | undefined) => {
        if (content?.status == ContentStatus.Published) {
            return "success";
        }

        if (content?.status == ContentStatus.Draft) {
            return "info";
        }

        return "default";
    };
});
</script>

<template>
    <Menu as="div" class="relative inline-block text-left">
        <div>
            <MenuButton
                class="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
                {{ selectedLanguageName }}
                <ChevronDownIcon class="-mr-1 h-5 w-5 text-gray-400" aria-hidden="true" />
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
                class="absolute -right-1 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
            >
                <div class="py-1">
                    <MenuItem
                        v-slot="{ active }"
                        v-for="language in translatedLanguages"
                        :key="language.languageCode"
                    >
                        <button
                            @click="selectedLanguage = language.languageCode"
                            :class="[
                                active || selectedLanguage == language.languageCode
                                    ? 'bg-gray-100 text-gray-900'
                                    : 'text-gray-700',
                                'flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm',
                            ]"
                        >
                            <span class="flex items-center gap-2">
                                <LBadge
                                    type="language"
                                    :variant="
                                        translationStatus(
                                            post?.content.find(
                                                (c: Content) =>
                                                    c.language.languageCode ==
                                                    language.languageCode,
                                            ),
                                        )
                                    "
                                    no-icon
                                >
                                    {{ language.languageCode }}
                                </LBadge>
                                {{ language.name }}
                            </span>

                            <CheckCircleIcon
                                v-if="selectedLanguage == language.languageCode"
                                class="h-4 w-4 text-gray-500"
                            />
                        </button>
                    </MenuItem>

                    <div
                        v-if="untranslatedLanguages"
                        class="mb-1 mt-4 px-4 text-xs uppercase tracking-wider text-gray-600"
                    >
                        Add translation
                    </div>

                    <MenuItem
                        v-slot="{ active }"
                        v-for="language in untranslatedLanguages"
                        :key="language.languageCode"
                    >
                        <button
                            :class="[
                                active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                'group flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm',
                            ]"
                        >
                            <span class="flex items-center gap-2">
                                <LBadge type="language" no-icon>
                                    {{ language.languageCode }}
                                </LBadge>
                                {{ language.name }}
                            </span>

                            <ArrowRightIcon
                                class="hidden h-4 w-4 text-gray-600 sm:group-hover:inline-block sm:group-active:inline-block"
                            />
                        </button>
                    </MenuItem>
                </div>
            </MenuItems>
        </transition>
    </Menu>
</template>
