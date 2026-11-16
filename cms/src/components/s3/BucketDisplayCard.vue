<script setup lang="ts">
import {
    type GroupDto,
    type StorageDto,
    type StorageStatus,
    AclPermission,
    verifyAccess,
    DocType,
} from "luminary-shared";
import { computed } from "vue";
import DisplayCard from "../common/DisplayCard.vue";
import LBadge from "../common/LBadge.vue";
import { UserGroupIcon } from "@heroicons/vue/24/outline";
import { SignalIcon, SignalSlashIcon } from "@heroicons/vue/20/solid";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    bucket: StorageDto & {
        connectionStatus: StorageStatus;
        statusMessage?: string;
    };
    groups: GroupDto[];
};

type Emits = {
    edit: [bucket: StorageDto];
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
        case "unauthorized":
            return "Unauthorized";
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

const canEdit = computed(() =>
    verifyAccess(props.bucket.memberOf, DocType.Storage, AclPermission.Edit),
);
</script>

<template>
    <DisplayCard
        :title="capitaliseFirstLetter(bucket.name)"
        :updated-time-utc="bucket.updatedTimeUtc"
        :navigate-to="() => emit('edit', bucket)"
        :can-navigate="canEdit"
    >
        <template #content>
            <div class="flex w-full min-w-0 items-center gap-2 py-1 text-xs">
                <div class="flex w-full min-w-0 items-center gap-1.5">
                    <span class="text-xs text-zinc-500 dark:text-zinc-400">Path:</span>
                    <code
                        class="truncate rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-slate-900/60 dark:text-zinc-200"
                        >{{ bucket.publicUrl }}</code
                    >
                </div>
                <div class="flex flex-nowrap gap-1">
                    <LBadge
                        type="default"
                        :variant="statusVariant"
                        class="gap-1 whitespace-nowrap text-xs font-semibold"
                    >
                        <component
                            :is="statusIcon"
                            class="h-4 w-4"
                            :class="`text-${statusVariant}`"
                        />
                        {{ statusText }}
                    </LBadge>
                </div>
            </div>
        </template>

        <template #mobileFooter>
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
                    >
                        {{ group.name }}
                    </LBadge>
                    <LBadge v-if="bucketGroups.length === 0" type="default" variant="default">
                        No groups
                    </LBadge>
                </div>
            </div>
        </template>

        <template #desktopFooter>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge
                    v-for="group in bucketGroups"
                    :key="group._id"
                    type="default"
                    variant="blue"
                >
                    {{ group.name }}
                </LBadge>
                <LBadge v-if="bucketGroups.length === 0" type="default" variant="default">
                    No groups
                </LBadge>
            </div>
        </template>
    </DisplayCard>
</template>
