<script setup lang="ts">
import { type RouteLocationRaw, useRouter } from "vue-router";
import { ClockIcon } from "@heroicons/vue/24/outline";
import { DateTime } from "luxon";
import LBadge from "./LBadge.vue";
import { db } from "luminary-shared";
import { isSmallScreen } from "@/globalConfig";

type Props = {
    title: string;
    updatedTimeUtc: number;
    isLocalChange?: boolean;
    navigateTo?: RouteLocationRaw | (() => void);
    canNavigate?: boolean;
    showDate?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    isLocalChange: false,
    canNavigate: true,
    showDate: true,
});

const router = useRouter();

const renderDate = (size: "default" | "small", timestampRelevance: string, timestamp: number) =>
    size == "default"
        ? timestamp
            ? db.toDateTime(timestamp).toLocaleString(DateTime.DATETIME_SHORT)
            : `${timestampRelevance} not set`
        : db.toDateTime(timestamp).toLocaleString();

const handleClick = () => {
    if (!props.canNavigate || !props.navigateTo) return;
    if (typeof props.navigateTo === "function") {
        props.navigateTo();
    } else {
        router.push(props.navigateTo);
    }
};
</script>

<template>
    <div
        data-test="display-card"
        class="w-full cursor-pointer divide-y divide-zinc-100 border-y border-zinc-300 bg-white px-2 py-1 sm:rounded-md sm:border"
        :class="{ 'cursor-pointer': canNavigate && navigateTo }"
        @click="handleClick"
    >
        <!-- Header: Title and top badges -->
        <div
            v-if="title || isLocalChange"
            class="relative flex cursor-pointer items-center justify-between py-1"
        >
            <div
                data-test="card-title"
                class="w-full"
                :class="{
                    'flex justify-between': isSmallScreen,
                }"
            >
                <div class="flex items-center gap-0">
                    <div class="mr-1 max-w-full truncate text-wrap text-sm font-medium">
                        {{ title }}
                    </div>
                    <div>
                        <slot name="title-extension" />
                    </div>
                </div>
                <LBadge v-if="isLocalChange && isSmallScreen" variant="warning">
                    Offline changes
                </LBadge>
            </div>
            <div class="flex">
                <slot name="topRightContent" />
            </div>

            <!-- Top badges slot (for language badges, etc.) -->
            <div class="flex items-center justify-end">
                <div v-if="!isSmallScreen && $slots.topBadges" class="flex gap-1">
                    <LBadge v-if="isLocalChange" variant="warning" class="flex whitespace-nowrap">
                        Offline changes
                    </LBadge>
                    <slot name="topBadges" />
                </div>
            </div>
        </div>

        <!-- Mobile top badges slot -->
        <div v-if="isSmallScreen && $slots.mobileTopBadges" class="flex flex-wrap gap-1 py-1">
            <slot name="mobileTopBadges" />
        </div>

        <!-- Main content slot -->
        <slot name="content" />

        <!-- Footer: Bottom metadata -->
        <div
            v-if="isSmallScreen && $slots.mobileFooter"
            class="flex flex-wrap items-center gap-1 py-1"
        >
            <slot name="mobileFooter" />
            <div v-if="showDate" class="flex w-max items-start text-xs text-zinc-400">
                <ClockIcon class="mr-[1px] h-4 w-4 text-zinc-400" />
                <span title="Last Updated">{{
                    renderDate("small", "Last Updated", updatedTimeUtc)
                }}</span>
            </div>
        </div>

        <div
            v-if="!isSmallScreen && $slots.desktopFooter"
            class="flex items-center justify-between pt-1 text-xs sm:gap-4"
        >
            <slot name="desktopFooter" />
            <div v-if="showDate" class="flex items-center justify-end text-zinc-400">
                <ClockIcon class="mr-[1px] h-4 w-4 text-zinc-400" />
                <span title="Last Updated">{{
                    renderDate("default", "Last updated", updatedTimeUtc)
                }}</span>
            </div>
        </div>
    </div>
</template>
