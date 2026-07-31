<script setup lang="ts">
import { type RouteLocationRaw, useRouter } from "vue-router";
import { ClockIcon } from "@heroicons/vue/24/outline";
import { DateTime } from "luxon";
import LBadge from "./LBadge.vue";
import { db } from "luminary-shared";
import { isSmallScreen } from "@/globalConfig";

type Props = {
    title: string;
    /**
     * Optional pre-highlighted title HTML (e.g. search matches wrapped in `<mark>`).
     * Rendered with `v-html` when set; must be caller-escaped. Falls back to `title`.
     */
    titleHtml?: string;
    updatedTimeUtc: number;
    isLocalChange?: boolean;
    navigateTo?: RouteLocationRaw | (() => void);
    canNavigate?: boolean;
    showDate?: boolean;
    disable?: boolean;
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
    if (props.disable || !props.canNavigate || !props.navigateTo) return;

    if (typeof props.navigateTo === "function") {
        props.navigateTo();
    } else {
        router.push(props.navigateTo);
    }
};
</script>

Apply
<template>
    <div
        data-test="display-card"
        class="w-full divide-y divide-zinc-100 border-y border-zinc-300 bg-white px-2 py-1 transition-all duration-200 dark:divide-slate-800/80 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:divide-slate-700 sm:rounded-md sm:border"
        :class="[
            {
                'cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-800/70 dark:hover:shadow-lg':
                    !disable && canNavigate && navigateTo,
                'select-none divide-zinc-200 border-gray-200 bg-zinc-50/50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-zinc-600':
                    disable,
            },
        ]"
        @click="handleClick"
    >
        <!-- Header: Title -->
        <div v-if="title || isLocalChange" class="relative flex items-center justify-between py-1">
            <div
                data-test="card-title"
                class="w-full"
                :class="{ 'flex justify-between': isSmallScreen }"
            >
                <div class="flex items-center gap-0">
                    <div
                        v-if="titleHtml"
                        class="mr-1 max-w-full truncate text-wrap text-sm font-medium dark:text-zinc-100 [&_mark]:rounded [&_mark]:bg-amber-200 [&_mark]:px-0"
                        v-html="titleHtml"
                    ></div>
                    <div
                        v-else
                        class="mr-1 max-w-full truncate text-wrap text-sm font-medium dark:text-zinc-100"
                    >
                        {{ title }}
                    </div>
                    <div class="dark:text-zinc-400">
                        <slot name="title-extension" />
                    </div>
                </div>
                <LBadge v-if="isLocalChange && isSmallScreen" variant="warning">
                    Offline changes
                </LBadge>
            </div>
            <div v-if="$slots.topRightContent" class="flex">
                <slot name="topRightContent" />
            </div>

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
        <div class="dark:text-zinc-300">
            <slot name="content" />
        </div>

        <!-- Footer: Bottom metadata -->
        <div
            v-if="isSmallScreen && $slots.mobileFooter"
            class="flex flex-wrap items-center gap-1 py-1 dark:text-zinc-500"
        >
            <slot name="mobileFooter" />
            <div
                v-if="showDate"
                class="flex w-max items-start text-xs text-zinc-400 dark:text-zinc-500"
            >
                <ClockIcon class="mr-[1px] h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                <span title="Last Updated">{{
                    renderDate("small", "Last Updated", updatedTimeUtc)
                }}</span>
            </div>
        </div>

        <div
            v-if="!isSmallScreen && $slots.desktopFooter"
            class="flex items-center justify-between pt-1 text-xs dark:text-zinc-500 sm:gap-4"
        >
            <slot name="desktopFooter" />
            <div
                v-if="showDate"
                class="flex items-center justify-end text-zinc-400 dark:text-zinc-500"
            >
                <ClockIcon class="mr-[1px] h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                <span title="Last Updated">{{
                    renderDate("default", "Last updated", updatedTimeUtc)
                }}</span>
            </div>
        </div>
    </div>
</template>
