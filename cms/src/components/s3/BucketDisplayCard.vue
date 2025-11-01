<script setup lang="ts">
import {
    type S3BucketDto,
    type GroupDto,
    AclPermission,
    verifyAccess,
    DocType,
} from "luminary-shared";
import { computed } from "vue";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import { ClockIcon, UserGroupIcon } from "@heroicons/vue/24/outline";
import { SignalIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import { isSmallScreen } from "@/globalConfig";

// Import BucketStatus type for props typing
import type { BucketStatus } from "luminary-shared";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    bucket: S3BucketDto & {
        connectionStatus: BucketStatus;
        statusMessage?: string;
    };
    groups: GroupDto[];
};

type Emits = {
    edit: [bucket: S3BucketDto];
};

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const bucketGroups = computed(() =>
    props.groups.filter((group) => props.bucket.memberOf?.includes(group._id)),
);

const statusVariant = computed(() => {
    return props.bucket.connectionStatus === "connected" ? "success" : "warning";
});

const statusIcon = computed(() => {
    return props.bucket.connectionStatus === "connected" ? SignalIcon : SignalSlashIcon;
});

const statusText = computed(() => {
    switch (props.bucket.connectionStatus) {
        case "connected":
            return "Connected";
        case "unreachable":
            return "Unreachable";
        case "not-found":
            return "Not Found";
        case "no-credentials":
            return "No Credentials";
        case "checking":
            return "Checking...";
        default:
            return "Unknown";
    }
});

const renderDate = (size: "default" | "small", timestampRelevance: string, timestamp: number) =>
    size == "default"
        ? timestamp
            ? DateTime.fromMillis(timestamp).toLocaleString(DateTime.DATETIME_SHORT)
            : `${timestampRelevance} not set`
        : DateTime.fromMillis(timestamp).toLocaleString();

const canEdit = computed(() =>
    verifyAccess(props.bucket.memberOf, DocType.Storage, AclPermission.Edit),
);

const handleEdit = () => {
    if (canEdit.value) {
        emit("edit", props.bucket);
    }
};
</script>

<template>
    <div
        class="w-full cursor-pointer divide-y divide-zinc-100 border-y border-zinc-300 bg-white px-3 py-2 sm:rounded-md sm:border"
        @click="handleEdit"
    >
        <div class="relative flex cursor-pointer items-center justify-between pb-1.5">
            <div
                class="w-full"
                :class="{
                    'flex justify-between': isSmallScreen,
                }"
            >
                <div class="mr-1 max-w-full truncate text-wrap text-base font-medium">
                    {{ capitaliseFirstLetter(bucket.name) }}
                </div>
            </div>
        </div>

        <div class="flex w-full items-center gap-2 py-1.5 text-xs">
            <div class="flex w-full items-center gap-1.5">
                <span class="text-xs text-zinc-500">Path:</span>
                <code class="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{{
                    bucket.publicUrl
                }}</code>
            </div>
            <div class="flex flex-nowrap gap-1">
                <LBadge
                    type="default"
                    :variant="statusVariant"
                    class="gap-1 whitespace-nowrap text-xs font-semibold"
                >
                    <component :is="statusIcon" class="h-4 w-4" :class="`text-${statusVariant}`" />
                    {{ statusText }}
                </LBadge>
            </div>
        </div>

        <div v-if="isSmallScreen" class="flex flex-wrap items-center gap-1 py-1.5">
            <div class="flex flex-1 items-center gap-1">
                <div>
                    <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                </div>
                <div class="flex flex-wrap gap-1">
                    <LBadge
                        v-for="group in bucketGroups"
                        :key="group._id"
                        type="default"
                        variant="blue"
                        class="text-xs"
                    >
                        {{ group.name }}
                    </LBadge>
                    <LBadge
                        v-if="bucketGroups.length === 0"
                        type="default"
                        variant="default"
                        class="text-xs"
                    >
                        No groups
                    </LBadge>
                </div>
            </div>
            <div class="flex w-max items-start text-xs text-zinc-400">
                <ClockIcon class="mr-[1px] h-3.5 w-3.5 text-zinc-400" />
                <span title="Last Updated" class="text-[11px]">{{
                    renderDate("small", "Last Updated", bucket.updatedTimeUtc)
                }}</span>
            </div>
        </div>

        <div
            v-if="!isSmallScreen"
            class="flex items-center justify-between pt-1.5 text-xs sm:gap-4"
        >
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge
                    v-for="group in bucketGroups"
                    :key="group._id"
                    type="default"
                    variant="blue"
                    class="text-xs"
                >
                    {{ group.name }}
                </LBadge>
                <LBadge
                    v-if="bucketGroups.length === 0"
                    type="default"
                    variant="default"
                    class="text-xs"
                >
                    No groups
                </LBadge>
            </div>
            <div class="flex items-center justify-end text-zinc-400">
                <ClockIcon class="text-zinc-340 mr-[1px] h-3.5 w-3.5" />
                <span title="Last Updated" class="text-[11px]">{{
                    renderDate("default", "Last updated", bucket.updatedTimeUtc)
                }}</span>
            </div>
        </div>
    </div>
</template>
