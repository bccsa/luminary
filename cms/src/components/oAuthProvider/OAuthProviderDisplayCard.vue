<script setup lang="ts">
import {
    type GroupDto,
    type OAuthProviderDto,
    AclPermission,
    verifyAccess,
    DocType,
} from "luminary-shared";
import { computed } from "vue";
import LBadge from "../common/LBadge.vue";
import { DateTime } from "luxon";
import { ClockIcon, UserGroupIcon, KeyIcon } from "@heroicons/vue/24/outline";
import { isSmallScreen } from "@/globalConfig";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    provider: OAuthProviderDto;
    groups: GroupDto[];
};

type Emits = {
    edit: [provider: OAuthProviderDto];
};

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const providerGroups = computed(() =>
    props.groups.filter((group) => props.provider.memberOf?.includes(group._id)),
);

const renderDate = (size: "default" | "small", timestampRelevance: string, timestamp: number) =>
    size == "default"
        ? timestamp
            ? DateTime.fromMillis(timestamp).toLocaleString(DateTime.DATETIME_SHORT)
            : `${timestampRelevance} not set`
        : DateTime.fromMillis(timestamp).toLocaleString();

const canEdit = computed(() =>
    verifyAccess(props.provider.memberOf, DocType.OAuthProvider, AclPermission.Edit),
);

const handleEdit = () => {
    if (canEdit.value) {
        emit("edit", props.provider);
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
                    {{ capitaliseFirstLetter(provider.label) }}
                </div>
            </div>
        </div>

        <div class="flex w-full items-center gap-2 py-1.5 text-xs">
            <div class="flex w-full items-center gap-1.5">
                <KeyIcon class="h-4 w-4 text-zinc-400" />
                <span class="text-xs text-zinc-500">Provider Type:</span>
                <LBadge type="default" variant="default" class="text-xs">
                    {{ capitaliseFirstLetter(provider.providerType) }}
                </LBadge>
            </div>
            <div class="flex flex-nowrap gap-1">
                <LBadge
                    v-if="provider.credential_id"
                    type="default"
                    variant="success"
                    class="gap-1 whitespace-nowrap text-xs font-semibold"
                >
                    Credentials Configured
                </LBadge>
                <LBadge
                    v-else
                    type="default"
                    variant="warning"
                    class="gap-1 whitespace-nowrap text-xs font-semibold"
                >
                    No Credentials
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
                        v-for="group in providerGroups"
                        :key="group._id"
                        type="default"
                        variant="blue"
                        class="text-xs"
                    >
                        {{ group.name }}
                    </LBadge>
                    <LBadge
                        v-if="providerGroups.length === 0"
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
                    renderDate("small", "Last Updated", provider.updatedTimeUtc)
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
                    v-for="group in providerGroups"
                    :key="group._id"
                    type="default"
                    variant="blue"
                    class="text-xs"
                >
                    {{ group.name }}
                </LBadge>
                <LBadge
                    v-if="providerGroups.length === 0"
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
                    renderDate("default", "Last updated", provider.updatedTimeUtc)
                }}</span>
            </div>
        </div>
    </div>
</template>
