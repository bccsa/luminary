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
import LButton from "../button/LButton.vue";
import { DateTime } from "luxon";
import {
    ClockIcon,
    UserGroupIcon,
    PencilIcon,
    TrashIcon,
    SignalIcon,
} from "@heroicons/vue/24/outline";
import { isSmallScreen } from "@/globalConfig";

type Props = {
    bucket: S3BucketDto & {
        connectionStatus:
            | "connected"
            | "unreachable"
            | "unauthorized"
            | "not-found"
            | "no-credentials"
            | "checking"
            | "unknown";
        statusMessage?: string;
    };
    groups: GroupDto[];
};

type Emits = {
    edit: [bucket: S3BucketDto];
    delete: [
        bucket: S3BucketDto & {
            connectionStatus:
                | "connected"
                | "unreachable"
                | "unauthorized"
                | "not-found"
                | "no-credentials"
                | "checking"
                | "unknown";
            statusMessage?: string;
        },
    ];
    testConnection: [bucket: S3BucketDto];
};

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const bucketGroups = computed(() =>
    props.groups.filter((group) => props.bucket.memberOf?.includes(group._id)),
);

const statusVariant = computed(() => {
    switch (props.bucket.connectionStatus) {
        case "connected":
            return "success";
        case "unreachable":
        case "unauthorized":
        case "not-found":
            return "error";
        case "no-credentials":
            return "warning";
        case "checking":
            return "info";
        default:
            return "default";
    }
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

const renderDate = (size: "default" | "small", timestampRelevance: string, timestamp: number) =>
    size == "default"
        ? timestamp
            ? DateTime.fromMillis(timestamp).toLocaleString(DateTime.DATETIME_SHORT)
            : `${timestampRelevance} not set`
        : DateTime.fromMillis(timestamp).toLocaleString();

const canEdit = computed(() =>
    verifyAccess(props.bucket.memberOf, DocType.Storage, AclPermission.Edit),
);

const canDelete = computed(() =>
    verifyAccess(props.bucket.memberOf, DocType.Storage, AclPermission.Delete),
);

const handleEdit = () => {
    if (canEdit.value) {
        emit("edit", props.bucket);
    }
};

const handleDelete = () => {
    if (canDelete.value) {
        emit("delete", props.bucket);
    }
};

const handleTestConnection = () => {
    emit("testConnection", props.bucket);
};
</script>

<template>
    <div
        class="w-full cursor-pointer divide-y divide-zinc-100 border-y border-zinc-300 bg-white px-4 py-3 sm:rounded-md sm:border"
        @click="handleEdit"
    >
        <div class="relative flex cursor-pointer items-center justify-between py-1">
            <div
                class="w-full"
                :class="{
                    'flex justify-between': isSmallScreen,
                }"
            >
                <div class="mr-1 max-w-full truncate text-wrap text-lg font-medium">
                    {{ bucket.name }}
                </div>
            </div>

            <div class="flex items-center justify-end gap-2">
                <div class="flex gap-2">
                    <LButton
                        variant="muted"
                        size="sm"
                        @click.stop="handleTestConnection"
                        :title="'Test connection to ' + bucket.name"
                    >
                        <SignalIcon class="h-5 w-5" />
                    </LButton>
                    <LButton
                        v-if="canEdit"
                        variant="muted"
                        size="sm"
                        @click.stop="handleEdit"
                        :title="'Edit ' + bucket.name"
                    >
                        <PencilIcon class="h-5 w-5" />
                    </LButton>
                    <LButton
                        v-if="canDelete"
                        variant="muted"
                        size="sm"
                        @click.stop="handleDelete"
                        :title="'Delete ' + bucket.name"
                        class="text-red-600 hover:text-red-700"
                    >
                        <TrashIcon class="h-5 w-5" />
                    </LButton>
                </div>
            </div>
        </div>

        <div class="flex w-full items-center gap-2 py-2 text-xs">
            <div class="flex w-full items-center gap-1">
                <span class="text-sm text-zinc-500">Path:</span>
                <code class="rounded bg-zinc-100 px-1 py-0.5 text-sm">{{ bucket.httpPath }}</code>
            </div>
            <div class="flex gap-1">
                <LBadge type="default" :variant="statusVariant" class="font-bold">
                    {{ statusText.toLocaleUpperCase() }}
                </LBadge>
            </div>
        </div>

        <div v-if="isSmallScreen" class="flex flex-wrap items-center gap-1 py-1">
            <div class="flex flex-1 items-center gap-1">
                <div>
                    <UserGroupIcon class="h-5 w-5 text-zinc-400" />
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
            <div class="flex w-max items-start text-xs text-zinc-400">
                <ClockIcon class="mr-[1px] h-4 w-4 text-zinc-400" />
                <span title="Last Updated">{{
                    renderDate("small", "Last Updated", bucket.updatedTimeUtc)
                }}</span>
            </div>
        </div>

        <div v-if="!isSmallScreen" class="flex items-center justify-between pt-1 text-xs sm:gap-4">
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-5 w-5 text-zinc-400" />
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
            <div class="flex items-center justify-end text-zinc-400">
                <ClockIcon class="text-zinc-340 mr-[1px] h-4 w-4" />
                <span title="Last Updated">{{
                    renderDate("default", "Last updated", bucket.updatedTimeUtc)
                }}</span>
            </div>
        </div>
    </div>
</template>
