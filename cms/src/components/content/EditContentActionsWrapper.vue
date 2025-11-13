<script setup lang="ts">
import { ref } from "vue";
import { CloudArrowUpIcon } from "@heroicons/vue/20/solid";
import { ArrowUturnLeftIcon } from "@heroicons/vue/24/solid";
import LButton from "@/components/button/LButton.vue";
import LBadge from "@/components/common/LBadge.vue";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/vue/24/outline";
import LDropdown from "../common/LDropdown.vue";

type Props = {
    save: Function;
    duplicate: Function;
    delete: Function;
    revert: Function;
    parentId: string;
    liveUrl: string;
    isPublished: boolean;
    mobile: boolean;
    newDocument: boolean;
    isLocalChange: boolean;
    isDirty: boolean;
    actions: Array<{
        name: string;
        action: Function;
        icon: any;
        iconClass?: string;
    }>;
};

defineProps<Props>();

const showContentActionsMenuDesktop = ref(false);
const showContentActionsMenuMobile = ref(false);
</script>

<template>
    <!-- MOBILE -->
    <div v-if="mobile" class="relative flex items-center gap-1 lg:hidden">
        <div v-if="isLocalChange" class="mr-7 flex h-9 w-10 items-center lg:hidden">
            <LBadge class="h-full" variant="warning">Offline changes</LBadge>
        </div>

        <!-- SEGMENTED BUTTON + DROPDOWN -->
        <LButton variant="primary" segmented>
            <template v-if="isDirty && !newDocument" #left>
                <span
                    @click.stop="() => revert()"
                    data-test="revert-changes-button"
                    class="flex items-center gap-1"
                >
                    <ArrowUturnLeftIcon class="size-5" />
                </span>
            </template>

            <span
                @click="async () => await save()"
                data-test="save-button"
                class="flex items-center gap-1"
            >
                <CloudArrowUpIcon class="size-5" />
            </span>

            <template #right>
                <LDropdown
                    v-model:show="showContentActionsMenuMobile"
                    padding="small"
                    placement="bottom-end"
                    width="auto"
                >
                    <template #trigger>
                        <ChevronDownIcon v-if="!showContentActionsMenuMobile" class="size-5" />
                        <ChevronUpIcon v-else class="size-5" />
                    </template>
                    <ul>
                        <li
                            v-for="action in actions"
                            :key="action.name"
                            @click="
                                action.action();
                                showContentActionsMenuMobile = false;
                            "
                            :data-test="
                                action.name.toLowerCase() === 'duplicate'
                                    ? 'duplicate-button'
                                    : action.name.toLowerCase() + '-button'
                            "
                            class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm leading-6 text-zinc-500 hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
                        >
                            <component
                                :is="action.icon"
                                :class="action.iconClass"
                                aria-hidden="true"
                            />
                            <div class="flex flex-col text-nowrap leading-none">
                                {{ action.name }}
                            </div>
                        </li>
                    </ul>
                </LDropdown>
            </template>
        </LButton>
    </div>
    <!-- DESKTOP -->
    <div v-else class="hidden items-center gap-1 lg:flex">
        <div v-if="isLocalChange" class="hidden h-9 items-center gap-2 lg:flex">
            <LBadge class="h-full" variant="warning">Offline changes</LBadge>
        </div>

        <!-- SEGMENTED BUTTON + DROPDOWN -->
        <LButton variant="primary" segmented>
            <template v-if="isDirty && !newDocument" #left>
                <span
                    @click.stop="() => revert()"
                    data-test="revert-changes-button"
                    class="flex items-center gap-1"
                >
                    <ArrowUturnLeftIcon class="size-5" />
                    Revert
                </span>
            </template>

            <span
                @click="async () => await save()"
                data-test="save-button"
                class="flex items-center gap-1"
            >
                <CloudArrowUpIcon class="size-5" />
                Save
            </span>

            <template #right>
                <LDropdown
                    v-model:show="showContentActionsMenuDesktop"
                    padding="small"
                    placement="bottom-end"
                    width="auto"
                >
                    <template #trigger>
                        <ChevronDownIcon v-if="!showContentActionsMenuDesktop" class="size-5" />
                        <ChevronUpIcon v-else class="size-5" />
                    </template>
                    <ul>
                        <li
                            v-for="action in actions"
                            :key="action.name"
                            @click="
                                action.action();
                                showContentActionsMenuDesktop = false;
                            "
                            class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm leading-6 text-zinc-500 hover:bg-zinc-50 focus:bg-zinc-100 focus:outline-none"
                        >
                            <component
                                :is="action.icon"
                                :class="action.iconClass"
                                aria-hidden="true"
                            />
                            <div class="flex flex-col text-nowrap leading-none">
                                {{ action.name }}
                            </div>
                        </li>
                    </ul>
                </LDropdown>
            </template>
        </LButton>
    </div>
</template>
