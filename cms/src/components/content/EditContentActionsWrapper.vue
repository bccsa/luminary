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
    isSaving?: boolean;
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

// Refs to the segmented buttons so each dropdown panel can size itself to the full button width
// (its own trigger is just the chevron segment).
const segmentedButtonDesktop = ref<{ rootEl: HTMLElement | null } | null>(null);
const segmentedButtonMobile = ref<{ rootEl: HTMLElement | null } | null>(null);
</script>

<template>
    <!-- MOBILE -->
    <div v-if="mobile" class="relative flex items-center gap-1 pr-1 lg:hidden">
        <div v-if="isLocalChange" class="mr-7 flex h-9 w-10 items-center lg:hidden">
            <LBadge class="h-full" variant="warning">Offline changes</LBadge>
        </div>

        <!-- SEGMENTED BUTTON + DROPDOWN -->
        <LButton
            ref="segmentedButtonMobile"
            variant="primary"
            segmented
            :left-action="isDirty && !newDocument && !isSaving ? () => revert() : undefined"
            :main-action="isSaving ? undefined : async () => await save()"
            dropdown-anchor
            :main-dynamic-css="
                !isDirty || isSaving
                    ? '!bg-zinc-400 !text-zinc-100 !ring-zinc-400 pointer-events-none'
                    : ''
            "
        >
            <template v-if="isDirty && !newDocument" #left>
                <span data-test="revert-changes-button" class="flex items-center gap-1">
                    <ArrowUturnLeftIcon class="size-5" />
                </span>
            </template>

            <span data-test="save-button" class="flex items-center gap-1">
                <CloudArrowUpIcon class="size-5" />
            </span>

            <template #right>
                <LDropdown
                    v-model:show="showContentActionsMenuMobile"
                    padding="small"
                    placement="bottom-end"
                    width="auto"
                    :anchor-el="segmentedButtonMobile?.rootEl"
                    class="h-full"
                    trigger-class="flex flex-1 items-center justify-center px-3"
                >
                    <template #trigger>
                        <button class="z-20 flex size-full items-center justify-center">
                            <ChevronDownIcon v-if="!showContentActionsMenuMobile" class="size-5" />
                            <ChevronUpIcon v-else class="size-5" />
                        </button>
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
                            class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm leading-6 text-zinc-600 hover:bg-zinc-50 focus:bg-zinc-50 focus:outline-none"
                        >
                            <component
                                :is="action.icon"
                                :class="action.iconClass"
                                aria-hidden="true"
                            />
                            <div class="flex flex-col text-nowrap leading-none text-zinc-600">
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
        <LButton
            ref="segmentedButtonDesktop"
            variant="primary"
            segmented
            :left-action="isDirty && !newDocument && !isSaving ? () => revert() : undefined"
            :main-action="isSaving ? undefined : async () => await save()"
            dropdown-anchor
            :main-dynamic-css="
                !isDirty || isSaving
                    ? '!bg-zinc-400 !text-zinc-100 !ring-zinc-400 pointer-events-none'
                    : ''
            "
        >
            <template v-if="isDirty && !newDocument" #left>
                <span data-test="revert-changes-button" class="flex items-center gap-1">
                    <ArrowUturnLeftIcon class="size-5" />
                    Revert
                </span>
            </template>

            <span data-test="save-button" class="flex items-center gap-1">
                <CloudArrowUpIcon class="size-5" />
                Save
            </span>

            <template #right>
                <LDropdown
                    v-model:show="showContentActionsMenuDesktop"
                    padding="small"
                    placement="bottom-end"
                    width="auto"
                    :anchor-el="segmentedButtonDesktop?.rootEl"
                    class="h-full"
                    trigger-class="flex h-full w-full items-center justify-center px-3"
                >
                    <template #trigger>
                        <div data-test="dropdown-trigger">
                            <ChevronDownIcon v-if="!showContentActionsMenuDesktop" class="size-5" />
                            <ChevronUpIcon v-else class="size-5" />
                        </div>
                    </template>
                    <ul>
                        <li
                            v-for="action in actions"
                            :key="action.name"
                            @click="
                                action.action();
                                showContentActionsMenuDesktop = false;
                            "
                            :data-test="
                                action.name.toLowerCase() === 'duplicate'
                                    ? 'duplicate-button'
                                    : action.name.toLowerCase() + '-button'
                            "
                            class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm leading-6 text-zinc-400 hover:bg-zinc-50 focus:bg-zinc-100 focus:outline-none"
                        >
                            <component
                                :is="action.icon"
                                :class="action.iconClass"
                                aria-hidden="true"
                            />
                            <div class="flex flex-col text-nowrap leading-none text-zinc-600">
                                {{ action.name }}
                            </div>
                        </li>
                    </ul>
                </LDropdown>
            </template>
        </LButton>
    </div>
</template>
