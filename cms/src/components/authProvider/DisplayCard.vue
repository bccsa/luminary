<script setup lang="ts">
import {
    type GroupDto,
    type AuthProviderDto,
    AclPermission,
    verifyAccess,
    DocType,
} from "luminary-shared";
import { computed } from "vue";
import DisplayCard from "../common/DisplayCard.vue";
import LBadge from "../common/LBadge.vue";
import { UserGroupIcon } from "@heroicons/vue/24/outline";
import { capitaliseFirstLetter } from "@/util/string";

type Props = {
    provider: AuthProviderDto;
    groups: GroupDto[];
    isModified?: boolean;
};

type Emits = {
    edit: [provider: AuthProviderDto];
};

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const providerGroups = computed(() =>
    props.groups.filter((group) => props.provider.memberOf?.includes(group._id)),
);

const title = computed(
    () =>
        capitaliseFirstLetter(props.provider.displayName || props.provider.label) ||
        props.provider.domain ||
        "Auth provider",
);

const canEdit = computed(() =>
    verifyAccess(props.provider.memberOf ?? [], DocType.AuthProvider, AclPermission.Edit),
);
</script>

<template>
    <DisplayCard
        :title="title"
        :updated-time-utc="provider.updatedTimeUtc"
        :navigate-to="() => emit('edit', provider)"
        :can-navigate="canEdit"
    >
        <template #content>
            <div class="flex w-full items-center gap-2 py-1 text-xs">
                <div class="flex flex-nowrap gap-1 dark:text-zinc-100">
                    <LBadge
                        v-if="provider.domain && provider.clientId"
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
                    <LBadge
                        v-if="isModified"
                        type="default"
                        variant="warning"
                        class="gap-1 whitespace-nowrap text-xs font-semibold"
                    >
                        Incoming edit
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
                        v-for="group in providerGroups"
                        :key="group._id"
                        type="default"
                        variant="blue"
                    >
                        {{ group.name }}
                    </LBadge>
                    <LBadge v-if="providerGroups.length === 0" type="default" variant="default">
                        No groups
                    </LBadge>
                </div>
            </div>
        </template>

        <template #desktopFooter>
            <div class="flex w-full flex-1 flex-wrap items-center gap-1">
                <UserGroupIcon class="h-4 w-4 text-zinc-400" />
                <LBadge
                    v-for="group in providerGroups"
                    :key="group._id"
                    type="default"
                    variant="blue"
                >
                    {{ group.name }}
                </LBadge>
                <LBadge v-if="providerGroups.length === 0" type="default" variant="default">
                    No groups
                </LBadge>
            </div>
        </template>
    </DisplayCard>
</template>
